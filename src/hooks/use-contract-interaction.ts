'use client';

import { useCallback } from 'react';
import { type Hex, parseAbi, zeroHash } from 'viem';
import {
  useAccount,
  useBlockNumber,
  usePublicClient,
  useWalletClient,
} from 'wagmi';
import {
  ABI_CARBON_CREDIT_NFT,
  ABI_CARBON_CREDIT_TOKEN,
  ABI_CARBON_REGISTRY,
  CONTRACTS,
} from '@/config/contracts';
import { creditFromTuple } from '@/lib/credit-decode';
import { getLogsChunked, getLogsClient } from '@/lib/logs-client';
import {
  isRegistryConfigured,
  type OnchainCompany,
  type RegistrationType,
  type RegistryWrite,
  readCompany,
  readEmissions,
  readRegistrationType,
  readTrader,
  sendRegistryTx,
  tonnesToWei,
} from '@/lib/registry';
import { retireNftCredits } from '@/lib/retirement';
import {
  CCT_DECIMALS,
  parseAmountInput,
  readTokenDecimals,
  toDisplayNumber,
} from '@/lib/token-units';
import { writeContractOnTargetChain } from '@/lib/wallet-write';
import type { CarbonCredit, Order } from '@/types/carb';

interface WatchedEvent {
  type: 'CreditMinted' | 'OrderCreated';
  logs: readonly unknown[];
}

type OrderTuple = readonly [
  bigint,
  `0x${string}`,
  boolean,
  bigint,
  bigint,
  bigint,
  boolean,
  bigint,
  bigint,
  boolean,
];

// Chain tuple -> UI order. Exact wei values are kept next to the display numbers
// so approvals and fills never go through floats. `pricePerTonne` is stored in
// payment-token base units (e.g. 6-decimals USDG) and shown in whole tokens.
const toOrder = (order: OrderTuple, paymentDecimals: number): Order => ({
  orderId: Number(order[0]),
  trader: order[1] as string,
  isBuyOrder: order[2],
  amount: toDisplayNumber(order[3], CCT_DECIMALS),
  pricePerTonne: toDisplayNumber(order[4], paymentDecimals),
  filled: toDisplayNumber(order[5], CCT_DECIMALS),
  amountWei: order[3],
  priceWei: order[4],
  filledWei: order[5],
  paymentDecimals,
  isActive: order[6],
  createdAt: Number(order[7]),
  expiresAt: Number(order[8]),
  requiresKYC: order[9],
});

/** Parses a typed decimal; throws a descriptive Error so callers can toast it. */
const parseOrThrow = (
  label: string,
  value: string,
  decimals: number
): bigint => {
  const parsed = parseAmountInput(value, decimals);
  if (parsed === null) {
    throw new Error(
      `Invalid ${label}: enter a positive number with at most ${decimals} decimals.`
    );
  }
  return parsed;
};

const ADDRESS_REGEX = /^0x[a-fA-F0-9]{40}$/;
const ZERO_ADDRESS_REGEX = /^0x0{40}$/;

const isValidAddress = (value?: string) => {
  if (!value) {
    return false;
  }
  if (!ADDRESS_REGEX.test(value)) {
    return false;
  }
  return !ZERO_ADDRESS_REGEX.test(value);
};

const ensureContractAddress = (label: string, value: string): boolean => {
  if (!isValidAddress(value)) {
    console.error(
      `${label} address is not configured. Update your .env.local and restart the dev server.`
    );
    return false;
  }
  return true;
};

export const useContractInteraction = () => {
  const { address, isConnected } = useAccount();
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();
  const { data: blockNumber } = useBlockNumber({ watch: true });

  // Decimals are read from the token itself (cached per chain+token). Never assumed.
  const getTokenDecimals = useCallback(
    async (tokenAddress: string): Promise<number> => {
      if (!publicClient) {
        throw new Error('No RPC client available');
      }
      if (!ensureContractAddress('ERC20 token', tokenAddress)) {
        throw new Error('Token address is not configured');
      }
      return await readTokenDecimals(
        publicClient,
        tokenAddress as `0x${string}`
      );
    },
    [publicClient]
  );

  const getPaymentDecimals = useCallback(
    () => getTokenDecimals(CONTRACTS.usdc),
    [getTokenDecimals]
  );

  // Exact balance in token base units (bigint). Null when it cannot be read.
  const getErc20BalanceWei = useCallback(
    async (tokenAddress: string, userAddress: string) => {
      if (!publicClient) {
        return null;
      }
      if (!ensureContractAddress('ERC20 token', tokenAddress)) {
        return null;
      }
      try {
        return await publicClient.readContract({
          address: tokenAddress as `0x${string}`,
          abi: parseAbi([
            'function balanceOf(address owner) view returns (uint256)',
          ]),
          functionName: 'balanceOf',
          args: [userAddress as `0x${string}`],
        });
      } catch (error) {
        console.error('Error fetching token balance:', error);
        return null;
      }
    },
    [publicClient]
  );

  // Display balance in whole tokens using the token's own decimals (0 when unreadable).
  const getErc20Balance = useCallback(
    async (tokenAddress: string, userAddress: string) => {
      const [balance, decimals] = await Promise.all([
        getErc20BalanceWei(tokenAddress, userAddress),
        getTokenDecimals(tokenAddress).catch(() => null),
      ]);
      if (balance === null || decimals === null) {
        return 0;
      }
      return toDisplayNumber(balance, decimals);
    },
    [getErc20BalanceWei, getTokenDecimals]
  );

  // Exact allowance in token base units; 0n when unreadable (forces a fresh approval).
  const getErc20Allowance = useCallback(
    async (
      tokenAddress: string,
      owner: string,
      spender: string
    ): Promise<bigint> => {
      if (!publicClient) {
        return 0n;
      }
      if (!ensureContractAddress('ERC20 token', tokenAddress)) {
        return 0n;
      }
      try {
        return await publicClient.readContract({
          address: tokenAddress as `0x${string}`,
          abi: parseAbi([
            'function allowance(address owner, address spender) view returns (uint256)',
          ]),
          functionName: 'allowance',
          args: [owner as `0x${string}`, spender as `0x${string}`],
        });
      } catch (error) {
        console.error('Error fetching token allowance:', error);
        return 0n;
      }
    },
    [publicClient]
  );

  // Approves exactly `amountWei` (base units). Resolves null on rejection or revert.
  const approveErc20 = useCallback(
    async (
      tokenAddress: string,
      spender: string,
      amountWei: bigint,
      waitForConfirmation = true
    ) => {
      if (!(walletClient && address)) {
        return null;
      }
      if (!ensureContractAddress('ERC20 token', tokenAddress)) {
        return null;
      }
      try {
        const hash = await writeContractOnTargetChain(walletClient, {
          address: tokenAddress as `0x${string}`,
          abi: parseAbi([
            'function approve(address spender, uint256 amount) public returns (bool)',
          ]),
          functionName: 'approve',
          args: [spender as `0x${string}`, amountWei],
          account: address,
        });
        if (hash && waitForConfirmation && publicClient) {
          const receipt = await publicClient.waitForTransactionReceipt({
            hash,
          });
          if (receipt.status !== 'success') {
            return null;
          }
        }
        return hash;
      } catch (error) {
        console.error('Error approving token:', error);
        return null;
      }
    },
    [walletClient, address, publicClient]
  );

  // Makes sure the marketplace may pull `neededWei` of `token`. The allowance is
  // re-read before every transaction; when short, exactly `neededWei` is approved
  // and the new allowance is verified. Resolves false when approval did not land.
  const ensureErc20Allowance = useCallback(
    async (
      tokenAddress: string,
      neededWei: bigint,
      onApproving?: () => void
    ): Promise<boolean> => {
      if (!address) {
        return false;
      }
      const spender = CONTRACTS.carbonMarketplace;
      const current = await getErc20Allowance(tokenAddress, address, spender);
      if (current >= neededWei) {
        return true;
      }
      onApproving?.();
      const approveTx = await approveErc20(
        tokenAddress,
        spender,
        neededWei,
        true
      );
      if (!approveTx) {
        return false;
      }
      const updated = await getErc20Allowance(tokenAddress, address, spender);
      return updated >= neededWei;
    },
    [address, getErc20Allowance, approveErc20]
  );

  const approveNftForAll = useCallback(
    async (nftAddress: string, operator: string, approved: boolean) => {
      if (!(walletClient && address)) {
        return null;
      }
      if (
        !ensureContractAddress(
          'Carbon Credit NFT (NEXT_PUBLIC_CARBON_CREDIT_NFT)',
          nftAddress
        )
      ) {
        return null;
      }
      try {
        const hash = await writeContractOnTargetChain(walletClient, {
          address: nftAddress as `0x${string}`,
          abi: parseAbi([
            'function setApprovalForAll(address operator, bool approved) public',
          ]),
          functionName: 'setApprovalForAll',
          args: [operator as `0x${string}`, approved],
          account: address,
        });
        return hash;
      } catch (error) {
        console.error('Error approving NFT operator:', error);
        return null;
      }
    },
    [walletClient, address]
  );

  const wrapCredit = useCallback(
    async (tokenId: number) => {
      if (!(walletClient && address)) {
        return null;
      }
      if (
        !ensureContractAddress(
          'Carbon Credit Token (NEXT_PUBLIC_CARBON_CREDIT_TOKEN)',
          CONTRACTS.carbonCreditToken
        )
      ) {
        return null;
      }
      try {
        const hash = await writeContractOnTargetChain(walletClient, {
          address: CONTRACTS.carbonCreditToken as `0x${string}`,
          abi: ABI_CARBON_CREDIT_TOKEN,
          functionName: 'wrapCredit',
          args: [BigInt(tokenId)],
          account: address,
        });
        return hash;
      } catch (error) {
        console.error('Error wrapping credit:', error);
        return null;
      }
    },
    [walletClient, address]
  );

  // Carbon Credit NFT Functions
  const getCreditMetadata = useCallback(
    async (tokenId: bigint) => {
      if (!publicClient) {
        return null;
      }
      if (
        !ensureContractAddress(
          'Carbon Credit NFT (NEXT_PUBLIC_CARBON_CREDIT_NFT)',
          CONTRACTS.carbonCreditNFT
        )
      ) {
        return null;
      }
      try {
        const result = await publicClient.readContract({
          address: CONTRACTS.carbonCreditNFT as `0x${string}`,
          abi: ABI_CARBON_CREDIT_NFT,
          functionName: 'credits',
          args: [tokenId],
        });
        return result;
      } catch (error) {
        console.error('Error fetching credit metadata:', error);
        return null;
      }
    },
    [publicClient]
  );

  // Get all carbon credits for a user
  const getUserCredits = useCallback(
    async (userAddress: string) => {
      if (!publicClient) {
        return [];
      }
      if (
        !ensureContractAddress(
          'Carbon Credit NFT (NEXT_PUBLIC_CARBON_CREDIT_NFT)',
          CONTRACTS.carbonCreditNFT
        )
      ) {
        return [];
      }
      try {
        const balance = await publicClient.readContract({
          address: CONTRACTS.carbonCreditNFT as `0x${string}`,
          abi: parseAbi([
            'function balanceOf(address owner) view returns (uint256)',
          ]),
          functionName: 'balanceOf',
          args: [userAddress as `0x${string}`],
        });

        const credits: CarbonCredit[] = [];
        const tokenCount = Number(balance);
        for (let i = 0; i < tokenCount; i++) {
          try {
            const tokenId = await publicClient.readContract({
              address: CONTRACTS.carbonCreditNFT as `0x${string}`,
              abi: parseAbi([
                'function tokenOfOwnerByIndex(address owner, uint256 index) view returns (uint256)',
              ]),
              functionName: 'tokenOfOwnerByIndex',
              args: [userAddress as `0x${string}`, BigInt(i)],
            });

            const details = await getCreditMetadata(tokenId as bigint);
            if (!details) {
              continue;
            }

            credits.push(creditFromTuple(Number(tokenId), details));
          } catch (tokenError) {
            console.error(
              'Error fetching user credit at index:',
              i,
              tokenError
            );
          }
        }
        return credits;
      } catch (error) {
        console.error('Error fetching user credits:', error);
        return [];
      }
    },
    [publicClient, getCreditMetadata]
  );

  const getOrderById = useCallback(
    async (orderId: bigint) => {
      if (!publicClient) {
        return null;
      }
      try {
        ensureContractAddress(
          'Carbon Marketplace (NEXT_PUBLIC_CARBON_MARKETPLACE)',
          CONTRACTS.carbonMarketplace
        );
        const order = await publicClient.readContract({
          address: CONTRACTS.carbonMarketplace as `0x${string}`,
          abi: parseAbi([
            'function getOrder(uint256 orderId) view returns (uint256 orderId, address trader, bool isBuyOrder, uint256 amount, uint256 pricePerTonne, uint256 filled, bool isActive, uint256 createdAt, uint256 expiresAt, bool requiresKYC)',
          ]),
          functionName: 'getOrder',
          args: [orderId],
        });
        return order;
      } catch (error) {
        console.error('Error fetching order:', error);
        return null;
      }
    },
    [publicClient]
  );

  const getAuctionById = useCallback(
    async (auctionId: bigint) => {
      if (!publicClient) {
        return null;
      }
      try {
        ensureContractAddress(
          'Carbon Marketplace (NEXT_PUBLIC_CARBON_MARKETPLACE)',
          CONTRACTS.carbonMarketplace
        );
        const auction = await publicClient.readContract({
          address: CONTRACTS.carbonMarketplace as `0x${string}`,
          abi: parseAbi([
            'function getAuction(uint256 auctionId) view returns (uint256 auctionId, address seller, uint256 amount, uint256 startPrice, uint256 highestBid, address highestBidder, uint256 startTime, uint256 endTime, bool isActive)',
          ]),
          functionName: 'getAuction',
          args: [auctionId],
        });
        return auction;
      } catch (error) {
        console.error('Error fetching auction:', error);
        return null;
      }
    },
    [publicClient]
  );

  // Get marketplace orders from recent events
  const getMarketplaceOrders = useCallback(async () => {
    if (!publicClient) {
      return [];
    }
    try {
      ensureContractAddress(
        'Carbon Marketplace (NEXT_PUBLIC_CARBON_MARKETPLACE)',
        CONTRACTS.carbonMarketplace
      );
      const latestBlock = await publicClient.getBlockNumber();
      const fromBlock = latestBlock > 20000n ? latestBlock - 20000n : 0n;

      const logs = await getLogsChunked<{ args: { orderId?: bigint } }>(
        getLogsClient(publicClient),
        {
          address: CONTRACTS.carbonMarketplace as `0x${string}`,
          event: parseAbi([
            'event OrderCreated(uint256 indexed orderId, address indexed trader, bool isBuyOrder, uint256 amount, uint256 pricePerTonne)',
          ])[0],
          fromBlock,
          toBlock: latestBlock,
        }
      );

      const orderIds = Array.from(
        new Set(logs.map((log) => Number(log.args.orderId)))
      );

      const paymentDecimals = await getPaymentDecimals();
      const orders: Order[] = [];
      for (const id of orderIds) {
        const order = await getOrderById(BigInt(id));
        if (!order) {
          continue;
        }
        orders.push(toOrder(order as OrderTuple, paymentDecimals));
      }

      return orders;
    } catch (error) {
      console.error('Error fetching orders:', error);
      return [];
    }
  }, [publicClient, getOrderById, getPaymentDecimals]);

  // Get active auctions from recent events
  const getActiveAuctions = useCallback(async () => {
    if (!publicClient) {
      return [];
    }
    try {
      ensureContractAddress(
        'Carbon Marketplace (NEXT_PUBLIC_CARBON_MARKETPLACE)',
        CONTRACTS.carbonMarketplace
      );
      const latestBlock = await publicClient.getBlockNumber();
      const fromBlock = latestBlock > 20000n ? latestBlock - 20000n : 0n;

      const logs = await getLogsChunked<{ args: { auctionId?: bigint } }>(
        getLogsClient(publicClient),
        {
          address: CONTRACTS.carbonMarketplace as `0x${string}`,
          event: parseAbi([
            'event AuctionCreated(uint256 indexed auctionId, address indexed seller, uint256 amount, uint256 startPrice, uint256 endTime)',
          ])[0],
          fromBlock,
          toBlock: latestBlock,
        }
      );

      const auctionIds = Array.from(
        new Set(logs.map((log) => Number(log.args.auctionId)))
      );

      const paymentDecimals = await getPaymentDecimals();
      const auctions = [] as Array<{
        auctionId: number;
        seller: string;
        amount: number;
        startPrice: number;
        highestBid: number;
        amountWei: bigint;
        startPriceWei: bigint;
        highestBidWei: bigint;
        paymentDecimals: number;
        highestBidder: string;
        startTime: number;
        endTime: number;
        isActive: boolean;
      }>;
      for (const id of auctionIds) {
        const auction = await getAuctionById(BigInt(id));
        if (!auction) {
          continue;
        }
        auctions.push({
          auctionId: Number(auction[0]),
          seller: auction[1] as string,
          amount: toDisplayNumber(auction[2], CCT_DECIMALS),
          startPrice: toDisplayNumber(auction[3], paymentDecimals),
          highestBid: toDisplayNumber(auction[4], paymentDecimals),
          amountWei: auction[2],
          startPriceWei: auction[3],
          highestBidWei: auction[4],
          paymentDecimals,
          highestBidder: auction[5] as string,
          startTime: Number(auction[6]),
          endTime: Number(auction[7]),
          isActive: auction[8] as boolean,
        });
      }

      return auctions.filter((auction) => auction.isActive);
    } catch (error) {
      console.error('Error fetching auctions:', error);
      return [];
    }
  }, [publicClient, getAuctionById, getPaymentDecimals]);

  // Get carbon price from oracle
  const getCarbonPrice = useCallback(async () => {
    if (!publicClient) {
      return null;
    }
    try {
      ensureContractAddress(
        'Carbon Price Oracle (NEXT_PUBLIC_CARBON_PRICE_ORACLE)',
        CONTRACTS.carbonPriceOracle
      );
      const price = await publicClient.readContract({
        address: CONTRACTS.carbonPriceOracle as `0x${string}`,
        abi: parseAbi([
          'function getLatestPrice(string methodology) view returns (uint256)',
        ]),
        functionName: 'getLatestPrice',
        args: ['VERRA_VCS'],
      });
      return Number(price) / 1e8; // Assuming 8 decimal places
    } catch (error) {
      // The mainnet oracle is deployed unconfigured, so `getLatestPrice`
      // reverts until a price is reported. That is an expected "no price yet"
      // state, not a fault: return null and let the UI show its empty state.
      const message = error instanceof Error ? error.message : '';
      if (!message.includes('reverted')) {
        console.error('Error fetching carbon price:', error);
      }
      return null;
    }
  }, [publicClient]);

  // CarbonRegistry write helper: simulate, send, wait for receipt. Null when no wallet.
  const sendRegistry = useCallback(
    async (call: RegistryWrite) => {
      if (!(walletClient && address && publicClient)) {
        return null;
      }
      return await sendRegistryTx({
        publicClient,
        walletClient,
        account: address,
        call,
      });
    },
    [walletClient, address, publicClient]
  );

  // Get company emissions data
  const getCompanyEmissions = useCallback(
    async (companyAddress: string) => {
      if (!(publicClient && isRegistryConfigured())) {
        return null;
      }
      try {
        return await readEmissions(publicClient, companyAddress);
      } catch {
        return null;
      }
    },
    [publicClient]
  );

  // True when the wallet is registered in the CarbonRegistry (company or trader)
  const getHasRegistered = useCallback(
    async (userAddress: string) => {
      if (!(publicClient && userAddress && isRegistryConfigured())) {
        return false;
      }
      try {
        return (
          (await readRegistrationType(publicClient, userAddress)) !== 'none'
        );
      } catch {
        return false;
      }
    },
    [publicClient]
  );

  // 'company' | 'trader' | 'none' (also 'none' when unreachable)
  const getRegistrationType = useCallback(
    async (userAddress: string): Promise<RegistrationType> => {
      if (!(publicClient && userAddress && isRegistryConfigured())) {
        return 'none';
      }
      try {
        return await readRegistrationType(publicClient, userAddress);
      } catch {
        return 'none';
      }
    },
    [publicClient]
  );

  // Create buy order. `quantity` (tonnes) and `pricePerTonne` (payment token,
  // e.g. USDG) are the decimal strings typed by the user; they are parsed
  // exactly with the token decimals, never through floats.
  const createBuyOrder = useCallback(
    async (
      quantity: string,
      pricePerTonne: string,
      expiresInSeconds = 0,
      requiresKYC = false
    ) => {
      if (!(walletClient && address)) {
        return null;
      }
      try {
        ensureContractAddress(
          'Carbon Marketplace (NEXT_PUBLIC_CARBON_MARKETPLACE)',
          CONTRACTS.carbonMarketplace
        );
        const paymentDecimals = await getPaymentDecimals();
        const hash = await writeContractOnTargetChain(walletClient, {
          address: CONTRACTS.carbonMarketplace as `0x${string}`,
          abi: parseAbi([
            'function createBuyOrder(uint256 amount, uint256 pricePerTonne, uint256 expiresIn, bool requiresKYC_) public returns (uint256 orderId)',
          ]),
          functionName: 'createBuyOrder',
          args: [
            parseOrThrow('quantity', quantity, CCT_DECIMALS),
            parseOrThrow('price', pricePerTonne, paymentDecimals),
            BigInt(expiresInSeconds),
            requiresKYC,
          ],
          account: address,
        });
        return hash;
      } catch (error) {
        console.error('Error creating buy order:', error);
        throw error;
      }
    },
    [walletClient, address, getPaymentDecimals]
  );

  // Create sell order (same string-in conventions as createBuyOrder)
  const createSellOrder = useCallback(
    async (
      quantity: string,
      pricePerTonne: string,
      expiresInSeconds = 0,
      requiresKYC = false
    ) => {
      if (!(walletClient && address)) {
        return null;
      }
      try {
        ensureContractAddress(
          'Carbon Marketplace (NEXT_PUBLIC_CARBON_MARKETPLACE)',
          CONTRACTS.carbonMarketplace
        );
        const paymentDecimals = await getPaymentDecimals();
        const hash = await writeContractOnTargetChain(walletClient, {
          address: CONTRACTS.carbonMarketplace as `0x${string}`,
          abi: parseAbi([
            'function createSellOrder(uint256 amount, uint256 pricePerTonne, uint256 expiresIn, bool requiresKYC_) public returns (uint256 orderId)',
          ]),
          functionName: 'createSellOrder',
          args: [
            parseOrThrow('quantity', quantity, CCT_DECIMALS),
            parseOrThrow('price', pricePerTonne, paymentDecimals),
            BigInt(expiresInSeconds),
            requiresKYC,
          ],
          account: address,
        });
        return hash;
      } catch (error) {
        console.error('Error creating sell order:', error);
        throw error;
      }
    },
    [walletClient, address, getPaymentDecimals]
  );

  // Fill an order for exactly `amountWei` CCT base units (bigint, never a float).
  const fillOrder = useCallback(
    async (orderId: number, amountWei: bigint) => {
      if (!(walletClient && address)) {
        return null;
      }
      try {
        ensureContractAddress(
          'Carbon Marketplace (NEXT_PUBLIC_CARBON_MARKETPLACE)',
          CONTRACTS.carbonMarketplace
        );
        const hash = await writeContractOnTargetChain(walletClient, {
          address: CONTRACTS.carbonMarketplace as `0x${string}`,
          abi: parseAbi([
            'function fillOrder(uint256 orderId, uint256 amount) public',
          ]),
          functionName: 'fillOrder',
          args: [BigInt(orderId), amountWei],
          account: address,
        });
        return hash;
      } catch (error) {
        console.error('Error filling order:', error);
        throw error;
      }
    },
    [walletClient, address]
  );

  const cancelOrder = useCallback(
    async (orderId: number) => {
      if (!(walletClient && address)) {
        return null;
      }
      try {
        ensureContractAddress(
          'Carbon Marketplace (NEXT_PUBLIC_CARBON_MARKETPLACE)',
          CONTRACTS.carbonMarketplace
        );
        const hash = await writeContractOnTargetChain(walletClient, {
          address: CONTRACTS.carbonMarketplace as `0x${string}`,
          abi: parseAbi(['function cancelOrder(uint256 orderId) public']),
          functionName: 'cancelOrder',
          args: [BigInt(orderId)],
          account: address,
        });
        return hash;
      } catch (error) {
        console.error('Error canceling order:', error);
        return null;
      }
    },
    [walletClient, address]
  );

  // Retire NFT credits onchain (burns them, emits CreditRetired for the
  // certificate). Resolves with the tx hash once mined; throws a descriptive
  // Error on failure so callers can surface it.
  const retireCredits = useCallback(
    async (tokenIds: bigint[], reason: string) => {
      if (!(walletClient && publicClient && address)) {
        throw new Error('Connect your wallet to retire credits.');
      }
      return await retireNftCredits({
        walletClient,
        publicClient,
        account: address,
        tokenIds,
        reason,
      });
    },
    [walletClient, publicClient, address]
  );

  // Company Registration (onchain CarbonRegistry). Emissions are in tonnes.
  const registerCompany = useCallback(
    (companyData: {
      companyName: string;
      legalEntityId: string;
      scope1Emissions: number;
      scope2Emissions: number;
      scope3Emissions: number;
      /** keccak256(abi.encode(email, phone, salt)); see computeContactHash. */
      contactHash: Hex;
    }) =>
      sendRegistry({
        functionName: 'registerCompany',
        args: [
          companyData.companyName,
          companyData.legalEntityId,
          tonnesToWei(companyData.scope1Emissions),
          tonnesToWei(companyData.scope2Emissions),
          tonnesToWei(companyData.scope3Emissions),
          companyData.contactHash,
        ],
      }),
    [sendRegistry]
  );

  // Update name / legal ID / contact hash (any change resets KYB verification)
  const updateCompanyProfile = useCallback(
    (profile: {
      companyName: string;
      legalEntityId: string;
      contactHash: Hex;
    }) =>
      sendRegistry({
        functionName: 'updateCompanyProfile',
        args: [profile.companyName, profile.legalEntityId, profile.contactHash],
      }),
    [sendRegistry]
  );

  // Persist new Scope 1/2/3 totals (tonnes). Company wallet only.
  const updateEmissions = useCallback(
    (scope1: number, scope2: number, scope3: number) =>
      sendRegistry({
        functionName: 'updateEmissions',
        args: [tonnesToWei(scope1), tonnesToWei(scope2), tonnesToWei(scope3)],
      }),
    [sendRegistry]
  );

  // Set the annual reduction target (tonnes). Company wallet only.
  const setEmissionTarget = useCallback(
    (tonnes: number) =>
      sendRegistry({
        functionName: 'setEmissionTarget',
        args: [tonnesToWei(tonnes)],
      }),
    [sendRegistry]
  );

  // `profileHashOf(company)` as read right now: what a KYB approval covers.
  const getProfileHash = useCallback(
    async (company: string): Promise<Hex | null> => {
      if (!(publicClient && isRegistryConfigured())) {
        return null;
      }
      try {
        return await publicClient.readContract({
          address: CONTRACTS.carbonRegistry,
          abi: ABI_CARBON_REGISTRY,
          functionName: 'profileHashOf',
          args: [company as `0x${string}`],
        });
      } catch {
        return null;
      }
    },
    [publicClient]
  );

  // KYB verification; the contract requires VERIFIER_ROLE (see hasVerifierRole).
  // `expectedProfileHash` must be the `profileHashOf` the verifier reviewed (ignored when revoking).
  const setCompanyVerified = useCallback(
    (company: string, verified: boolean, expectedProfileHash: Hex = zeroHash) =>
      sendRegistry({
        functionName: 'setCompanyVerified',
        args: [company as `0x${string}`, verified, expectedProfileHash],
      }),
    [sendRegistry]
  );

  // Get Company Data from the registry; null when not a company or unreachable
  const getCompanyData = useCallback(
    async (companyAddress: string): Promise<OnchainCompany | null> => {
      if (!(publicClient && isRegistryConfigured())) {
        return null;
      }
      try {
        return await readCompany(publicClient, companyAddress);
      } catch {
        return null;
      }
    },
    [publicClient]
  );

  // KYB status; null when not a company or unreachable
  const getCompanyKyb = useCallback(
    async (companyAddress: string) => {
      const company = await getCompanyData(companyAddress);
      return company
        ? { verified: company.verified, registeredAt: company.registeredAt }
        : null;
    },
    [getCompanyData]
  );

  // Whether the address holds VERIFIER_ROLE on the registry
  const hasVerifierRole = useCallback(
    async (account: string) => {
      if (!(publicClient && isRegistryConfigured())) {
        return false;
      }
      try {
        const role = await publicClient.readContract({
          address: CONTRACTS.carbonRegistry,
          abi: ABI_CARBON_REGISTRY,
          functionName: 'VERIFIER_ROLE',
        });
        return await publicClient.readContract({
          address: CONTRACTS.carbonRegistry,
          abi: ABI_CARBON_REGISTRY,
          functionName: 'hasRole',
          args: [role, account as `0x${string}`],
        });
      } catch {
        return false;
      }
    },
    [publicClient]
  );

  // Create auction for CCT. `amount` (tonnes) and `startPrice` (total payment
  // token for the whole lot) are decimal strings parsed with the token decimals.
  const createAuction = useCallback(
    async (amount: string, startPrice: string, endTime: number) => {
      if (!(walletClient && address)) {
        return null;
      }
      try {
        ensureContractAddress(
          'Carbon Marketplace (NEXT_PUBLIC_CARBON_MARKETPLACE)',
          CONTRACTS.carbonMarketplace
        );
        const paymentDecimals = await getPaymentDecimals();
        const hash = await writeContractOnTargetChain(walletClient, {
          address: CONTRACTS.carbonMarketplace as `0x${string}`,
          abi: parseAbi([
            'function createAuction(uint256 amount, uint256 startPrice, uint256 endTime) public returns (uint256 auctionId)',
          ]),
          functionName: 'createAuction',
          args: [
            parseOrThrow('amount', amount, CCT_DECIMALS),
            parseOrThrow('start price', startPrice, paymentDecimals),
            BigInt(endTime),
          ],
          account: address,
        });
        return hash;
      } catch (error) {
        console.error('Error creating auction:', error);
        throw error;
      }
    },
    [walletClient, address, getPaymentDecimals]
  );

  // Bid exactly `bidAmountWei` payment-token base units.
  const placeBid = useCallback(
    async (auctionId: number, bidAmountWei: bigint) => {
      if (!(walletClient && address)) {
        return null;
      }
      try {
        ensureContractAddress(
          'Carbon Marketplace (NEXT_PUBLIC_CARBON_MARKETPLACE)',
          CONTRACTS.carbonMarketplace
        );
        const hash = await writeContractOnTargetChain(walletClient, {
          address: CONTRACTS.carbonMarketplace as `0x${string}`,
          abi: parseAbi([
            'function placeBid(uint256 auctionId, uint256 bidAmount) public',
          ]),
          functionName: 'placeBid',
          args: [BigInt(auctionId), bidAmountWei],
          account: address,
        });
        return hash;
      } catch (error) {
        console.error('Error placing bid:', error);
        throw error;
      }
    },
    [walletClient, address]
  );

  const finalizeAuction = useCallback(
    async (auctionId: number) => {
      if (!(walletClient && address)) {
        return null;
      }
      try {
        ensureContractAddress(
          'Carbon Marketplace (NEXT_PUBLIC_CARBON_MARKETPLACE)',
          CONTRACTS.carbonMarketplace
        );
        const hash = await writeContractOnTargetChain(walletClient, {
          address: CONTRACTS.carbonMarketplace as `0x${string}`,
          abi: parseAbi(['function finalizeAuction(uint256 auctionId) public']),
          functionName: 'finalizeAuction',
          args: [BigInt(auctionId)],
          account: address,
        });
        return hash;
      } catch (error) {
        console.error('Error finalizing auction:', error);
        throw error;
      }
    },
    [walletClient, address]
  );

  const cancelAuction = useCallback(
    async (auctionId: number) => {
      if (!(walletClient && address)) {
        return null;
      }
      try {
        ensureContractAddress(
          'Carbon Marketplace (NEXT_PUBLIC_CARBON_MARKETPLACE)',
          CONTRACTS.carbonMarketplace
        );
        const hash = await writeContractOnTargetChain(walletClient, {
          address: CONTRACTS.carbonMarketplace as `0x${string}`,
          abi: parseAbi(['function cancelAuction(uint256 auctionId) public']),
          functionName: 'cancelAuction',
          args: [BigInt(auctionId)],
          account: address,
        });
        return hash;
      } catch (error) {
        console.error('Error canceling auction:', error);
        throw error;
      }
    },
    [walletClient, address]
  );

  // Register Trader (onchain CarbonRegistry; waits for the receipt)
  const registerTrader = useCallback(
    (traderData: {
      traderName: string;
      /** keccak256(abi.encode(email, phone, salt)); see computeContactHash. */
      contactHash: Hex;
      country: string;
    }) =>
      sendRegistry({
        functionName: 'registerTrader',
        args: [
          traderData.traderName,
          traderData.contactHash,
          traderData.country,
        ],
      }),
    [sendRegistry]
  );

  // Get Trader Data from the registry; null when not a trader or unreachable
  const getTraderData = useCallback(
    async (traderAddress: string) => {
      if (!(publicClient && isRegistryConfigured())) {
        return null;
      }
      try {
        return await readTrader(publicClient, traderAddress);
      } catch {
        return null;
      }
    },
    [publicClient]
  );

  // Listen for events
  const watchContractEvents = useCallback(
    (callback: (eventData: WatchedEvent) => void) => {
      if (!publicClient) {
        return Promise.resolve();
      }

      try {
        // Watch for CreditMinted events
        publicClient.watchContractEvent({
          address: CONTRACTS.carbonCreditNFT,
          abi: parseAbi([
            'event CreditMinted(address indexed creator, uint256 indexed tokenId, uint256 tonnes)',
          ]),
          eventName: 'CreditMinted',
          onLogs: (logs) => {
            callback({
              type: 'CreditMinted',
              logs,
            });
          },
        });

        // Watch for trades
        publicClient.watchContractEvent({
          address: CONTRACTS.carbonMarketplace as `0x${string}`,
          abi: parseAbi([
            'event OrderCreated(uint256 indexed orderId, address indexed creator, uint256 amount, uint256 price)',
          ]),
          eventName: 'OrderCreated',
          onLogs: (logs) => {
            callback({
              type: 'OrderCreated',
              logs,
            });
          },
        });
      } catch (error) {
        console.error('Error watching events:', error);
      }
      return Promise.resolve();
    },
    [publicClient]
  );

  // ---- Tokenize / my-orders helpers ----
  // These throw instead of returning null so callers can tell a wallet
  // rejection from an onchain revert.
  const isNftApprovedForAll = useCallback(
    async (owner: string, operator: string) => {
      if (!(publicClient && isValidAddress(CONTRACTS.carbonCreditNFT))) {
        return false;
      }
      try {
        return await publicClient.readContract({
          address: CONTRACTS.carbonCreditNFT as `0x${string}`,
          abi: parseAbi([
            'function isApprovedForAll(address owner, address operator) view returns (bool)',
          ]),
          functionName: 'isApprovedForAll',
          args: [owner as `0x${string}`, operator as `0x${string}`],
        });
      } catch {
        return false;
      }
    },
    [publicClient]
  );

  const approveNftOperator = useCallback(
    async (operator: string) => {
      if (!(walletClient && address)) {
        throw new Error('Wallet not connected');
      }
      return await writeContractOnTargetChain(walletClient, {
        address: CONTRACTS.carbonCreditNFT as `0x${string}`,
        abi: parseAbi([
          'function setApprovalForAll(address operator, bool approved) public',
        ]),
        functionName: 'setApprovalForAll',
        args: [operator as `0x${string}`, true],
        account: address,
      });
    },
    [walletClient, address]
  );

  const wrapCreditInPool = useCallback(
    async (tokenAddress: string, tokenId: number) => {
      if (!(walletClient && address)) {
        throw new Error('Wallet not connected');
      }
      return await writeContractOnTargetChain(walletClient, {
        address: tokenAddress as `0x${string}`,
        abi: ABI_CARBON_CREDIT_TOKEN,
        functionName: 'wrapCredit',
        args: [BigInt(tokenId)],
        account: address,
      });
    },
    [walletClient, address]
  );

  const unwrapCredit = useCallback(
    async (
      tokenId: number,
      tokenAddress: string = CONTRACTS.carbonCreditToken
    ) => {
      if (!(walletClient && address)) {
        throw new Error('Wallet not connected');
      }
      return await writeContractOnTargetChain(walletClient, {
        address: tokenAddress as `0x${string}`,
        abi: ABI_CARBON_CREDIT_TOKEN,
        functionName: 'unwrapCredit',
        args: [BigInt(tokenId)],
        account: address,
      });
    },
    [walletClient, address]
  );

  // Authoritative per-trader order list (no log-window limit), including filled/cancelled orders.
  const getUserOrders = useCallback(
    async (userAddress: string) => {
      if (!(publicClient && isValidAddress(CONTRACTS.carbonMarketplace))) {
        return [];
      }
      try {
        const ids = await publicClient.readContract({
          address: CONTRACTS.carbonMarketplace as `0x${string}`,
          abi: parseAbi([
            'function getUserOrders(address user) view returns (uint256[])',
          ]),
          functionName: 'getUserOrders',
          args: [userAddress as `0x${string}`],
        });
        const paymentDecimals = await getPaymentDecimals();
        const orders: Order[] = [];
        for (const id of ids) {
          const order = await getOrderById(id);
          if (!order) {
            continue;
          }
          orders.push(toOrder(order as OrderTuple, paymentDecimals));
        }
        return orders;
      } catch (error) {
        console.error('Error fetching user orders:', error);
        return [];
      }
    },
    [publicClient, getOrderById, getPaymentDecimals]
  );

  // Minimum price per tonne (payment-token base units) enforced by the marketplace; null if it cannot be read.
  const getMinPricePerTonne = useCallback(async (): Promise<bigint | null> => {
    if (!(publicClient && isValidAddress(CONTRACTS.carbonMarketplace))) {
      return null;
    }
    try {
      return await publicClient.readContract({
        address: CONTRACTS.carbonMarketplace as `0x${string}`,
        abi: parseAbi(['function minPricePerTonne() view returns (uint256)']),
        functionName: 'minPricePerTonne',
      });
    } catch (error) {
      console.error('Error reading minimum price:', error);
      return null;
    }
  }, [publicClient]);

  // Payment-token amount (base units) credited to `user` by a failed push payment
  // (e.g. a blocked USDG transfer); withdrawable with `claimPending`. Null when unreadable.
  const getPendingWithdrawals = useCallback(
    async (user: string): Promise<bigint | null> => {
      if (!(publicClient && isValidAddress(CONTRACTS.carbonMarketplace))) {
        return null;
      }
      try {
        return await publicClient.readContract({
          address: CONTRACTS.carbonMarketplace as `0x${string}`,
          abi: parseAbi([
            'function pendingWithdrawals(address) view returns (uint256)',
          ]),
          functionName: 'pendingWithdrawals',
          args: [user as `0x${string}`],
        });
      } catch (error) {
        console.error('Error reading pending withdrawals:', error);
        return null;
      }
    },
    [publicClient]
  );

  // Pull payment of everything credited in `pendingWithdrawals`.
  const claimPending = useCallback(async () => {
    if (!(walletClient && address && publicClient)) {
      return null;
    }
    ensureContractAddress(
      'Carbon Marketplace (NEXT_PUBLIC_CARBON_MARKETPLACE)',
      CONTRACTS.carbonMarketplace
    );
    const hash = await writeContractOnTargetChain(walletClient, {
      address: CONTRACTS.carbonMarketplace as `0x${string}`,
      abi: parseAbi(['function claim() returns (uint256 amount)']),
      functionName: 'claim',
      account: address,
    });
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    if (receipt.status !== 'success') {
      throw new Error('Claim transaction reverted onchain.');
    }
    return hash;
  }, [walletClient, address, publicClient]);

  return {
    // State
    isConnected,
    address,
    blockNumber,
    publicClient,

    // Read functions
    getCreditMetadata,
    getUserCredits,
    getMarketplaceOrders,
    getActiveAuctions,
    getErc20Balance,
    getErc20BalanceWei,
    getErc20Allowance,
    getTokenDecimals,
    getPaymentDecimals,
    approveNftForAll,
    getCarbonPrice,
    getCompanyEmissions,
    getCompanyData,
    getTraderData,
    getHasRegistered,

    // Write functions
    ensureErc20Allowance,
    createBuyOrder,
    createSellOrder,
    fillOrder,
    cancelOrder,
    approveErc20,
    wrapCredit,
    retireCredits,
    registerCompany,
    registerTrader,
    createAuction,
    placeBid,
    finalizeAuction,
    cancelAuction,

    // Event listening
    watchContractEvents,
    // Tokenize / my-orders
    isNftApprovedForAll,
    approveNftOperator,
    wrapCreditInPool,
    unwrapCredit,
    getUserOrders,
    getMinPricePerTonne,
    getPendingWithdrawals,
    claimPending,

    // CarbonRegistry (company / trader profiles, KYB)
    getRegistrationType,
    getProfileHash,
    getCompanyKyb,
    hasVerifierRole,
    updateCompanyProfile,
    updateEmissions,
    setEmissionTarget,
    setCompanyVerified,

    // Loading state
    isLoading: false,
  };
};
