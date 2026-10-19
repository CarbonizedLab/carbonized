import type { AppKitNetwork } from '@reown/appkit/networks';
import { createAppKit } from '@reown/appkit/react';
import { WagmiAdapter } from '@reown/appkit-adapter-wagmi';
import { defineChain, type Transport } from 'viem';
import { createConfig, http, injected } from 'wagmi';
import { hardhat, polygon, polygonAmoy, sepolia } from 'wagmi/chains';
import {
  ROBINHOOD_MAINNET_CHAIN_ID,
  ROBINHOOD_MAINNET_NETWORK,
  ROBINHOOD_TESTNET_CHAIN_ID,
} from '@/lib/network';

const HARDHAT_RPC_URL = 'http://127.0.0.1:8545';

const isDevelopment = process.env.NODE_ENV === 'development';

/** Robinhood Chain mainnet (Arbitrum Orbit L2, ETH gas, canonical USDG settlement). */
export const robinhoodMainnet = defineChain({
  id: ROBINHOOD_MAINNET_CHAIN_ID,
  name: 'Robinhood Chain',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: {
    default: { http: ['https://rpc.mainnet.chain.robinhood.com'] },
  },
  blockExplorers: {
    default: {
      name: 'Robinhood Chain Explorer',
      url: 'https://robinhoodchain.blockscout.com',
    },
  },
});

/** Robinhood Chain testnet (Arbitrum Orbit L2, ETH gas). Test tokens have no value. */
export const robinhoodTestnet = defineChain({
  id: ROBINHOOD_TESTNET_CHAIN_ID,
  name: 'Robinhood Chain Testnet',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: {
    default: { http: ['https://rpc.testnet.chain.robinhood.com/rpc'] },
  },
  blockExplorers: {
    default: {
      name: 'Robinhood Explorer',
      url: 'https://explorer.testnet.chain.robinhood.com',
    },
  },
  testnet: true,
});

export const networkName =
  process.env.NEXT_PUBLIC_NETWORK ?? (isDevelopment ? 'hardhat' : 'sepolia');

export const targetChain = (() => {
  switch (networkName) {
    case ROBINHOOD_MAINNET_NETWORK:
      return robinhoodMainnet;
    case 'robinhood':
    case 'robinhood-testnet':
      return robinhoodTestnet;
    case 'polygon':
      return polygon;
    case 'mumbai':
    case 'amoy':
      return polygonAmoy;
    case 'hardhat':
      return hardhat;
    default:
      return sepolia;
  }
})();

const rpcUrl =
  process.env.NEXT_PUBLIC_RPC_URL ??
  (targetChain.id === hardhat.id ? HARDHAT_RPC_URL : undefined);

/** Reown (WalletConnect) project id from https://dashboard.reown.com. */
export const reownProjectId = process.env.NEXT_PUBLIC_REOWN_PROJECT_ID ?? '';
export const isReownEnabled = reownProjectId.length > 0;

const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';

const networks: [AppKitNetwork, ...AppKitNetwork[]] = [targetChain];

const reownAdapter = isReownEnabled
  ? new WagmiAdapter({
      networks,
      projectId: reownProjectId,
      ssr: true,
      transports: {
        [targetChain.id]: http(rpcUrl),
      } as Record<number, Transport>,
    })
  : null;

if (reownAdapter) {
  createAppKit({
    adapters: [reownAdapter],
    networks,
    defaultNetwork: targetChain,
    projectId: reownProjectId,
    metadata: {
      name: 'Carbonized',
      description: 'Decentralized carbon credit marketplace',
      url: appUrl,
      icons: [`${appUrl}/icon.png`],
    },
    features: { analytics: false },
  });
}

/** Reown-backed config when a project id is set; injected wallets otherwise. */
export const wagmiConfig =
  reownAdapter?.wagmiConfig ??
  createConfig({
    chains: [targetChain],
    connectors: [injected()],
    transports: {
      [targetChain.id]: http(rpcUrl),
    } as Record<number, Transport>,
    ssr: true,
  });
