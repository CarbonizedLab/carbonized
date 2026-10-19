import { parseAbi } from 'viem';

const isHardhat =
  process.env.NEXT_PUBLIC_NETWORK === 'hardhat' ||
  process.env.NEXT_PUBLIC_CHAIN_ID === '31337';

// Fallback addresses (Hardhat deterministic - VERRA_VCS is the marketplace token)
const LOCAL_ADDRESSES = {
  carbonCreditNFT: '0x5FbDB2315678afecb367f032d93F642f64180aa3',
  carbonCreditToken: '0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0', // VERRA_VCS - marketplace trades this token
  carbonMarketplace: '0x0165878A594ca255338adfa4d48449f69242Eb8F',
  carbonPriceOracle: '0x610178dA211FEF7D417bC0e6FeD39F05609AD788',
  emissionVerifier: '0x2279B7A0a67DB372996a5FaB50D91eAA73d2eBe6',
  usdc: '0xDc64a140Aa3E981100a9becA4E685f962f0cF6C9',
} as const;

const normalizeAddress = (value?: string) => {
  if (!value || value === '0x') {
    return '';
  }
  return value;
};

const resolveAddress = (envValue?: string, fallback?: string) => {
  const resolved = normalizeAddress(envValue) || fallback || '0x';
  return resolved as `0x${string}`;
};

// Contract addresses - UPDATE THESE AFTER DEPLOYMENT
export const CONTRACTS = {
  carbonCreditNFT: resolveAddress(
    process.env.NEXT_PUBLIC_CARBON_CREDIT_NFT,
    isHardhat ? LOCAL_ADDRESSES.carbonCreditNFT : undefined
  ),
  carbonCreditToken: resolveAddress(
    process.env.NEXT_PUBLIC_CARBON_CREDIT_TOKEN,
    isHardhat ? LOCAL_ADDRESSES.carbonCreditToken : undefined
  ),
  carbonMarketplace: resolveAddress(
    process.env.NEXT_PUBLIC_CARBON_MARKETPLACE,
    isHardhat ? LOCAL_ADDRESSES.carbonMarketplace : undefined
  ),
  carbonPriceOracle: resolveAddress(
    process.env.NEXT_PUBLIC_CARBON_PRICE_ORACLE,
    isHardhat ? LOCAL_ADDRESSES.carbonPriceOracle : undefined
  ),
  emissionVerifier: resolveAddress(
    process.env.NEXT_PUBLIC_EMISSION_VERIFIER,
    isHardhat ? LOCAL_ADDRESSES.emissionVerifier : undefined
  ),
  // Mainnet settles in canonical USDG. NEXT_PUBLIC_USDC_ADDRESS is retained only
  // for legacy/testnet deployment files that still use a mock USDC contract.
  usdc: resolveAddress(
    process.env.NEXT_PUBLIC_USDG_ADDRESS ??
      process.env.NEXT_PUBLIC_USDC_ADDRESS,
    isHardhat ? LOCAL_ADDRESSES.usdc : undefined
  ),
  carbonRegistry: resolveAddress(process.env.NEXT_PUBLIC_CARBON_REGISTRY),
  // CARB utility stack: all optional. Unset (the default) means "CARB is not live yet";
  // the token pages show that state and nothing else in the app depends on them.
  carbToken: resolveAddress(process.env.NEXT_PUBLIC_CARB_TOKEN),
  carbStaking: resolveAddress(process.env.NEXT_PUBLIC_CARB_STAKING),
  issuerBond: resolveAddress(process.env.NEXT_PUBLIC_ISSUER_BOND),
  governor: resolveAddress(process.env.NEXT_PUBLIC_GOVERNOR),
  timelock: resolveAddress(process.env.NEXT_PUBLIC_TIMELOCK),
  // Voting wrapper (CarbVotes, vCARB) around an external CARB that has no votes of its own. Set = governance
  // requires depositing CARB into it; unset = votes live on the CARB token itself.
  carbVotes: resolveAddress(process.env.NEXT_PUBLIC_CARB_VOTES),
} as const;

// "true" when CARB is an external (launchpad) token rather than Carbonized's own CarbToken.
export const CARB_EXTERNAL_FLAG =
  process.env.NEXT_PUBLIC_CARB_EXTERNAL === 'true';

// CarbonCreditNFT: native issuance is NATIVE_ISSUER_ROLE only (`mintCredit` / `batchMint`); there is
// no public mint, faucet or starter path. Tonnes are 18-decimal fixed point.
export const ABI_CARBON_CREDIT_NFT = parseAbi([
  'function mintCredit(address to, string projectId, string projectName, string serialNumber, string methodology, uint256 co2Tonnes, uint256 vintageYear, string geography, bytes32 oracleProofHash, string satelliteDataCID, string tokenURI) returns (uint256 tokenId)',
  'function batchMint(address to, string projectId, (string projectName, string serialNumber, string methodology, uint256 co2Tonnes, uint256 vintageYear, string geography, bytes32 oracleProofHash, string satelliteDataCID, string tokenURI)[] credits_) returns (uint256[] tokenIds)',
  'function retireCredit(uint256 tokenId, string reason)',
  'function batchRetire(uint256[] tokenIds, string reason)',
  'function credits(uint256 tokenId) view returns (string projectId, string projectName, string methodology, uint256 co2Tonnes, uint256 vintageYear, string geography, bytes32 oracleProofHash, string satelliteDataCID, address verificationSource, uint256 verificationDate, bool isRetired, uint256 issuanceDate, string serialNumber)',
  'function retirementCertificates(uint256 tokenId) view returns (uint256 originalTokenId, address retiredBy, uint256 retirementDate, string retirementReason, uint256 co2Tonnes)',
  'function userRetiredTonnes(address user) view returns (uint256)',
  'function isSerialTokenized(string methodology, string serialNumber) view returns (bool)',
  'function getGlobalStats() view returns (uint256 minted, uint256 retired, uint256 active, uint256 totalTokens)',
  'function totalMintedTonnes() view returns (uint256)',
  'function totalRetiredTonnes() view returns (uint256)',
  'function totalActiveCredits() view returns (uint256)',
  'function MAX_BATCH_MINT() view returns (uint256)',
  'function MAX_TONNES_PER_CREDIT() view returns (uint256)',
  'function NATIVE_ISSUER_ROLE() view returns (bytes32)',
  'function EXTERNAL_ISSUER_ROLE() view returns (bytes32)',
  'function DEFAULT_ADMIN_ROLE() view returns (bytes32)',
  'function hasRole(bytes32 role, address account) view returns (bool)',
  'function grantRole(bytes32 role, address account)',
  'function revokeRole(bytes32 role, address account)',
  'function paused() view returns (bool)',
  'function balanceOf(address owner) view returns (uint256)',
  'function ownerOf(uint256 tokenId) view returns (address)',
  'function tokenOfOwnerByIndex(address owner, uint256 index) view returns (uint256)',
  'function tokenURI(uint256 tokenId) view returns (string)',
  'event CreditMinted(uint256 indexed tokenId, string indexed projectId, address indexed recipient, uint256 co2Tonnes, string methodology)',
  'event CreditBatchMinted(uint256[] tokenIds, string projectId, uint256 totalTonnes)',
  'event CreditRetired(uint256 indexed tokenId, address indexed retiredBy, uint256 timestamp, uint256 co2Tonnes, string reason)',
  'event SerialNumberRegistered(bytes32 indexed serialHash, string serialNumber, uint256 tokenId)',
  'event RoleGranted(bytes32 indexed role, address indexed account, address indexed sender)',
  'event RoleRevoked(bytes32 indexed role, address indexed account, address indexed sender)',
]);

// CarbonCreditToken (CCT, one pool per methodology): wrapping is permissionless but
// only for credits that pass the pool's quality gate (see `getWrapBlocker`).
export const ABI_CARBON_CREDIT_TOKEN = parseAbi([
  'function wrapCredit(uint256 tokenId) returns (uint256 tonnesMinted)',
  'function batchWrap(uint256[] tokenIds) returns (uint256 totalMinted)',
  'function unwrapCredit(uint256 tokenId) returns (uint256 tonnesBurned)',
  'function unwrapAny(uint256 amount) returns (uint256 tokenId)',
  'function getUserWrappedNFTs(address user) view returns (uint256[])',
  'function wrappedCountByTonnes(uint256 amount) view returns (uint256)',
  'function wrappedNFTs(uint256 tokenId) view returns (bool)',
  'function wrappedTonnes(uint256 tokenId) view returns (uint256)',
  'function wrapperOf(uint256 tokenId) view returns (address)',
  'function getBackingInfo() view returns (uint256 nftsLocked, uint256 tonnesLocked, uint256 tokensCirculating)',
  'function isFullyBacked() view returns (bool)',
  'function totalNFTsWrapped() view returns (uint256)',
  'function totalTonnesWrapped() view returns (uint256)',
  'function methodology() view returns (string)',
  'function paused() view returns (bool)',
  'function balanceOf(address owner) view returns (uint256)',
  'function totalSupply() view returns (uint256)',
  'function symbol() view returns (string)',
  'function decimals() view returns (uint8)',
  'event CreditWrapped(address indexed user, uint256 indexed tokenId, uint256 co2Tonnes)',
  'event CreditUnwrapped(address indexed user, uint256 indexed tokenId, uint256 co2Tonnes)',
  'event BatchWrapped(address indexed user, uint256[] tokenIds, uint256 totalTonnes)',
]);

export const ABI_CARBON_MARKETPLACE = [
  {
    name: 'createBuyOrder',
    type: 'function',
    inputs: [
      { name: 'amount', type: 'uint256' },
      { name: 'pricePerTonne', type: 'uint256' },
      { name: 'expiresIn', type: 'uint256' },
      { name: 'requiresKYC_', type: 'bool' },
    ],
    outputs: [{ name: 'orderId', type: 'uint256' }],
  },
  {
    name: 'createSellOrder',
    type: 'function',
    inputs: [
      { name: 'amount', type: 'uint256' },
      { name: 'pricePerTonne', type: 'uint256' },
      { name: 'expiresIn', type: 'uint256' },
      { name: 'requiresKYC_', type: 'bool' },
    ],
    outputs: [{ name: 'orderId', type: 'uint256' }],
  },
  {
    name: 'fillOrder',
    type: 'function',
    inputs: [
      { name: 'orderId', type: 'uint256' },
      { name: 'amount', type: 'uint256' },
    ],
  },
  {
    name: 'createAuction',
    type: 'function',
    inputs: [
      { name: 'amount', type: 'uint256' },
      { name: 'startPrice', type: 'uint256' },
      { name: 'endTime', type: 'uint256' },
    ],
    outputs: [{ name: 'auctionId', type: 'uint256' }],
  },
  {
    name: 'placeBid',
    type: 'function',
    inputs: [
      { name: 'auctionId', type: 'uint256' },
      { name: 'bidAmount', type: 'uint256' },
    ],
  },
  {
    name: 'finalizeAuction',
    type: 'function',
    inputs: [{ name: 'auctionId', type: 'uint256' }],
  },
  {
    name: 'cancelAuction',
    type: 'function',
    inputs: [{ name: 'auctionId', type: 'uint256' }],
  },
  {
    name: 'minPricePerTonne',
    type: 'function',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    name: 'cancelOrder',
    type: 'function',
    inputs: [{ name: 'orderId', type: 'uint256' }],
  },
  {
    name: 'addLiquidity',
    type: 'function',
    inputs: [
      { name: 'carbonAmount', type: 'uint256' },
      { name: 'stableAmount', type: 'uint256' },
    ],
  },
  {
    name: 'orders',
    type: 'function',
    inputs: [{ name: 'orderId', type: 'uint256' }],
    outputs: [
      { name: 'orderId', type: 'uint256' },
      { name: 'trader', type: 'address' },
      { name: 'isBuyOrder', type: 'bool' },
      { name: 'amount', type: 'uint256' },
      { name: 'pricePerTonne', type: 'uint256' },
      { name: 'filled', type: 'uint256' },
      { name: 'isActive', type: 'bool' },
      { name: 'createdAt', type: 'uint256' },
      { name: 'expiresAt', type: 'uint256' },
      { name: 'requiresKYC', type: 'bool' },
    ],
    stateMutability: 'view',
  },
  {
    name: 'getOrder',
    type: 'function',
    inputs: [{ name: 'orderId', type: 'uint256' }],
    outputs: [
      { name: 'orderId', type: 'uint256' },
      { name: 'trader', type: 'address' },
      { name: 'isBuyOrder', type: 'bool' },
      { name: 'amount', type: 'uint256' },
      { name: 'pricePerTonne', type: 'uint256' },
      { name: 'filled', type: 'uint256' },
      { name: 'isActive', type: 'bool' },
      { name: 'createdAt', type: 'uint256' },
      { name: 'expiresAt', type: 'uint256' },
      { name: 'requiresKYC', type: 'bool' },
    ],
    stateMutability: 'view',
  },
  {
    name: 'getUserOrders',
    type: 'function',
    inputs: [{ name: 'user', type: 'address' }],
    outputs: [{ name: '', type: 'uint256[]' }],
    stateMutability: 'view',
  },
  {
    name: 'getAuction',
    type: 'function',
    inputs: [{ name: 'auctionId', type: 'uint256' }],
    outputs: [
      { name: 'auctionId', type: 'uint256' },
      { name: 'seller', type: 'address' },
      { name: 'amount', type: 'uint256' },
      { name: 'startPrice', type: 'uint256' },
      { name: 'highestBid', type: 'uint256' },
      { name: 'highestBidder', type: 'address' },
      { name: 'startTime', type: 'uint256' },
      { name: 'endTime', type: 'uint256' },
      { name: 'isActive', type: 'bool' },
    ],
    stateMutability: 'view',
  },
  {
    name: 'getUserAuctions',
    type: 'function',
    inputs: [{ name: 'user', type: 'address' }],
    outputs: [{ name: '', type: 'uint256[]' }],
    stateMutability: 'view',
  },
  {
    name: 'OrderCreated',
    type: 'event',
    inputs: [
      { indexed: true, name: 'orderId', type: 'uint256' },
      { indexed: true, name: 'trader', type: 'address' },
      { indexed: false, name: 'isBuyOrder', type: 'bool' },
      { indexed: false, name: 'amount', type: 'uint256' },
      { indexed: false, name: 'pricePerTonne', type: 'uint256' },
    ],
  },
  {
    name: 'OrderFilled',
    type: 'event',
    inputs: [
      { indexed: true, name: 'orderId', type: 'uint256' },
      { indexed: true, name: 'taker', type: 'address' },
      { indexed: false, name: 'amountFilled', type: 'uint256' },
      { indexed: false, name: 'totalCost', type: 'uint256' },
    ],
  },
  {
    name: 'AuctionCreated',
    type: 'event',
    inputs: [
      { indexed: true, name: 'auctionId', type: 'uint256' },
      { indexed: true, name: 'seller', type: 'address' },
      { indexed: false, name: 'amount', type: 'uint256' },
      { indexed: false, name: 'startPrice', type: 'uint256' },
      { indexed: false, name: 'endTime', type: 'uint256' },
    ],
  },
  {
    name: 'BidPlaced',
    type: 'event',
    inputs: [
      { indexed: true, name: 'auctionId', type: 'uint256' },
      { indexed: true, name: 'bidder', type: 'address' },
      { indexed: false, name: 'bidAmount', type: 'uint256' },
    ],
  },
  {
    name: 'AuctionFinalized',
    type: 'event',
    inputs: [
      { indexed: true, name: 'auctionId', type: 'uint256' },
      { indexed: true, name: 'winner', type: 'address' },
      { indexed: false, name: 'winningBid', type: 'uint256' },
    ],
  },
  {
    name: 'AuctionCancelled',
    type: 'event',
    inputs: [{ indexed: true, name: 'auctionId', type: 'uint256' }],
  },
] as const;

// CarbonRegistry: onchain company/trader profiles (emissions in tonnes, 18 decimals)
export const ABI_CARBON_REGISTRY = parseAbi([
  'function registerCompany(string name, string legalId, uint256 scope1, uint256 scope2, uint256 scope3, bytes32 contactHash)',
  'function updateCompanyProfile(string name, string legalId, bytes32 contactHash)',
  'function updateEmissions(uint256 scope1, uint256 scope2, uint256 scope3)',
  'function setEmissionTarget(uint256 target)',
  'function setCompanyVerified(address company, bool verified, bytes32 expectedProfileHash)',
  'function registerTrader(string name, bytes32 contactHash, string country)',
  'function getCompanyData(address company) view returns (string name, string legalId, bytes32 contactHash, uint256 scope1, uint256 scope2, uint256 scope3, uint256 target, bool verified, uint256 registeredAt, uint256 updatedAt)',
  'function getCompanyEmissions(address company) view returns (uint256 scope1, uint256 scope2, uint256 scope3, uint256 target)',
  'function getCompanyKyb(address company) view returns (bool verified, uint256 registeredAt)',
  'function getTraderData(address trader) view returns (string name, bytes32 contactHash, string country, uint256 registrationDate, bool isActive)',
  'function profileHashOf(address company) view returns (bytes32)',
  'function registrationTypeOf(address account) view returns (uint8)',
  'function hasRole(bytes32 role, address account) view returns (bool)',
  'function VERIFIER_ROLE() view returns (bytes32)',
  'event CompanyRegistered(address indexed company, string name, string legalId, uint256 scope1, uint256 scope2, uint256 scope3)',
  'event EmissionsUpdated(address indexed company, uint256 scope1, uint256 scope2, uint256 scope3, uint256 total, uint256 timestamp)',
  'event EmissionTargetSet(address indexed company, uint256 target)',
  'event TraderRegistered(address indexed trader, string name, string country)',
  'event CompanyVerified(address indexed company, bool verified, address indexed verifier)',
]);

// CARB token. Carbonized's own CarbToken (ERC-20 + ERC-2612 + ERC-5805 votes with a timestamp clock + burn, fixed supply)
// or an EXTERNAL token (e.g. launched through a launchpad): only the plain ERC-20 reads / approve are guaranteed
// there; `delegates` / `delegate` / `getVotes` / `clock` exist only on a token with native votes.
export const ABI_CARB_TOKEN = parseAbi([
  'function name() view returns (string)',
  'function symbol() view returns (string)',
  'function decimals() view returns (uint8)',
  'function totalSupply() view returns (uint256)',
  'function balanceOf(address account) view returns (uint256)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function approve(address spender, uint256 amount) returns (bool)',
  'function delegates(address account) view returns (address)',
  'function delegate(address delegatee)',
  'function getVotes(address account) view returns (uint256)',
  'function clock() view returns (uint48)',
  'event DelegateChanged(address indexed delegator, address indexed fromDelegate, address indexed toDelegate)',
]);

// CarbVotes (vCARB): 1:1 voting wrapper around the external CARB (ERC-20 + ERC-5805 votes, timestamp clock).
export const ABI_CARB_VOTES = parseAbi([
  'function name() view returns (string)',
  'function symbol() view returns (string)',
  'function decimals() view returns (uint8)',
  'function totalSupply() view returns (uint256)',
  'function balanceOf(address account) view returns (uint256)',
  'function underlying() view returns (address)',
  'function depositFor(address account, uint256 amount) returns (bool)',
  'function withdrawTo(address account, uint256 amount) returns (bool)',
  'function delegates(address account) view returns (address)',
  'function delegate(address delegatee)',
  'function getVotes(address account) view returns (uint256)',
  'function clock() view returns (uint48)',
  'event DelegateChanged(address indexed delegator, address indexed fromDelegate, address indexed toDelegate)',
]);

// CarbStaking: tier staking and the marketplace's IFeeDiscount provider.
export const ABI_CARB_STAKING = parseAbi([
  'function stake(uint256 amount)',
  'function unstake(uint256 amount)',
  'function withdraw() returns (uint256 amount)',
  'function effectiveStake(address account) view returns (uint256)',
  'function tierOf(address account) view returns (uint256 tier)',
  'function discountBps(address user) view returns (uint256)',
  'function positionOf(address account) view returns (uint256 matured, uint256 pending, uint256 pendingSince, uint256 cooling, uint256 unlockAt)',
  'function balanceOf(address account) view returns (uint256)',
  'function tierThresholds(uint256 index) view returns (uint256)',
  'function tierDiscountBps(uint256 tier) view returns (uint16)',
  'function totalStaked() view returns (uint256)',
  'function WARMUP() view returns (uint256)',
  'function COOLDOWN() view returns (uint256)',
  'function setTierThresholds(uint256[3] thresholds)',
  'function setTierDiscounts(uint16[4] discountsBps)',
  'event Staked(address indexed account, uint256 amount)',
  'event Unstaked(address indexed account, uint256 amount, uint256 unlockAt)',
  'event Withdrawn(address indexed account, uint256 amount)',
]);

// IssuerBond: bond-gated issuer path with unbonding delay and slashing (dispute window).
export const ABI_ISSUER_BOND = parseAbi([
  'function bond(uint256 amount)',
  'function startUnbond()',
  'function withdraw() returns (uint256 amount)',
  'function disputeSlash(uint256 id, bytes32 evidenceHash)',
  'function executeSlash(uint256 id) returns (uint256 slashed)',
  'function bonds(address issuer) view returns (uint128 amount, uint64 releaseAt, bool unbonding, bool roleViaBond)',
  'function slashProposals(uint256 id) view returns (address issuer, uint128 amount, uint64 executableAt, uint64 expiresAt, bool disputed, bool resolved)',
  'function activeSlashOf(address issuer) view returns (uint256)',
  'function hasActiveSlash(address issuer) view returns (bool)',
  'function isBondedIssuer(address issuer) view returns (bool)',
  'function blocked(address issuer) view returns (bool)',
  'function minBond() view returns (uint256)',
  'function bondRequired() view returns (bool)',
  'function UNBOND_DELAY() view returns (uint256)',
  'function DISPUTE_WINDOW() view returns (uint256)',
  'function setMinBond(uint256 newMinBond)',
  'function slashTreasury() view returns (address)',
  'function slashSink() view returns (address)',
  'function tokenDecimals() view returns (uint8)',
  'event Bonded(address indexed issuer, uint256 amount, uint256 totalBond, bool roleGranted)',
  'event UnbondStarted(address indexed issuer, uint256 amount, uint256 releaseAt, bool roleRevoked)',
  'event SlashProposed(uint256 indexed id, address indexed issuer, uint256 amount, string reason, uint256 executableAt, uint256 expiresAt)',
  'event SlashDisputed(uint256 indexed id, address indexed issuer, bytes32 evidenceHash)',
  'event SlashCancelled(uint256 indexed id, address indexed issuer)',
  'event Slashed(uint256 indexed id, address indexed issuer, uint256 amount, address indexed sink, bool burned)',
]);

// CarbGovernor (OpenZeppelin Governor 4.9, timestamp clock) + CarbTimelock execution.
export const ABI_CARB_GOVERNOR = parseAbi([
  'function votingDelay() view returns (uint256)',
  'function votingPeriod() view returns (uint256)',
  'function proposalThreshold() view returns (uint256)',
  'function quorum(uint256 timepoint) view returns (uint256)',
  'function quorumNumerator() view returns (uint256)',
  'function quorumDenominator() view returns (uint256)',
  'function state(uint256 proposalId) view returns (uint8)',
  'function proposalSnapshot(uint256 proposalId) view returns (uint256)',
  'function proposalDeadline(uint256 proposalId) view returns (uint256)',
  'function proposalEta(uint256 proposalId) view returns (uint256)',
  'function proposalVotes(uint256 proposalId) view returns (uint256 againstVotes, uint256 forVotes, uint256 abstainVotes)',
  'function hasVoted(uint256 proposalId, address account) view returns (bool)',
  'function getVotes(address account, uint256 timepoint) view returns (uint256)',
  'function allowedTargets(address target) view returns (bool)',
  'function timelock() view returns (address)',
  'function propose(address[] targets, uint256[] values, bytes[] calldatas, string description) returns (uint256)',
  'function castVote(uint256 proposalId, uint8 support) returns (uint256)',
  'function queue(address[] targets, uint256[] values, bytes[] calldatas, bytes32 descriptionHash) returns (uint256)',
  'function execute(address[] targets, uint256[] values, bytes[] calldatas, bytes32 descriptionHash) payable returns (uint256)',
  'event ProposalCreated(uint256 proposalId, address proposer, address[] targets, uint256[] values, string[] signatures, bytes[] calldatas, uint256 voteStart, uint256 voteEnd, string description)',
  'event VoteCast(address indexed voter, uint256 proposalId, uint8 support, uint256 weight, string reason)',
  'event ProposalQueued(uint256 proposalId, uint256 eta)',
  'event ProposalExecuted(uint256 proposalId)',
  'event ProposalCanceled(uint256 proposalId)',
]);

// CarbonMarketplace governance-grade parameters (PARAMETER_ROLE = the timelock) and the fee-tier view.
export const ABI_MARKETPLACE_PARAMS = parseAbi([
  'function feeDiscountBpsOf(address user) view returns (uint256)',
  'function feeDiscountProvider() view returns (address)',
  'function tradingFeePercent() view returns (uint256)',
  'function kycGateEnabled() view returns (bool)',
  'function minPricePerTonne() view returns (uint256)',
  'function MAX_MIN_PRICE_PER_TONNE() view returns (uint256)',
  'function setTradingFee(uint256 newFeePercent)',
  'function setMinPricePerTonne(uint256 newMinPrice)',
  'function setKYCGate(bool enabled)',
  'function setFeeDiscountProvider(address provider)',
]);
