// Carbon Credit Types
export interface CarbonCredit {
  id: string;
  tokenId: number;
  projectId: string;
  projectName: string;
  methodology: 'ICM_COMPLIANCE' | 'VERRA_VCS' | 'GOLD_STANDARD';
  co2Tonnes: number;
  vintageYear: number;
  geography: string;
  verificationDate: number;
  isRetired: boolean;
  issuanceDate: number;
  /** Registry serial exactly as stored onchain; empty means the credit is unverified and cannot be wrapped. */
  serialNumber: string;
  /** Oracle / evidence proof hash; the zero hash means the credit is unverified and cannot be wrapped. */
  oracleProofHash: `0x${string}`;
  priceHistory?: PricePoint[];
}

export interface PricePoint {
  timestamp: number;
  price: number;
  volume: number;
}

// Marketplace Types
export interface Order {
  orderId: number;
  trader: string;
  isBuyOrder: boolean;
  amount: number;
  pricePerTonne: number;
  filled: number;
  /** Exact onchain values (CCT 18 decimals; price in payment-token base units). `amount`/`filled`/`pricePerTonne` above are display-only floats. */
  amountWei: bigint;
  filledWei: bigint;
  priceWei: bigint;
  paymentDecimals: number;
  isActive: boolean;
  createdAt: number;
  expiresAt: number;
  requiresKYC: boolean;
}

export interface AuctionListing {
  id: string;
  creditId: string;
  seller: string;
  startPrice: number;
  currentBid: number;
  highestBidder: string;
  startTime: number;
  endTime: number;
  quantity: number;
  status: 'active' | 'ended' | 'cancelled';
  bids: Bid[];
}

export interface Bid {
  id: string;
  bidder: string;
  amount: number;
  timestamp: number;
  transactionHash: string;
}

// Company Types
export interface Company {
  id: string;
  name: string;
  industry: string;
  location: string;
  walletAddress: string;
  carbonIntensity: number;
  emissionsTarget: number;
  emissionsActual: number;
  creditsOwned: number;
  creditsNeeded: number;
  profileImage?: string;
  website?: string;
  createdAt: number;
}

export interface CompanyData {
  name: string;
  legalEntityId: string;
  scope1: bigint;
  scope2: bigint;
  scope3: bigint;
  totalEmissions: bigint;
  availableCredits: bigint;
  walletAddress: string;
  email: string;
  phone: string;
  isVerified: boolean;
  registrationDate: number;
}

export interface CompanyEmissions {
  companyId: string;
  date: number;
  scope1: number; // Direct emissions
  scope2: number; // Indirect emissions
  scope3: number; // Value chain emissions
  total: number;
  source: 'IoT' | 'API' | 'Manual' | 'Satellite';
  verified: boolean;
  oracleProofHash: string;
}

export interface CreditRequest {
  requestId: string;
  companyAddress: string;
  creditAmountNeeded: number;
  maxPricePerTonne: number;
  deadline: number;
  status: 'pending' | 'partial' | 'filled';
  amountFilled: number;
  createdAt: number;
  expiresAt: number;
}

export interface CreditListing {
  listingId: string;
  seller: string;
  creditIds: string[];
  amount: number;
  pricePerTonne: number;
  saleType: 'fixed-price' | 'auction';
  status: 'active' | 'pending' | 'sold' | 'cancelled';
  createdAt: number;
  startTime?: number;
  endTime?: number;
  startPrice?: number;
  currentBid?: number;
}

export interface CompanyEmissions {
  companyId: string;
  date: number;
  scope1: number; // Direct emissions
  scope2: number; // Indirect emissions
  scope3: number; // Value chain emissions
  total: number;
  source: 'IoT' | 'API' | 'Manual' | 'Satellite';
  verified: boolean;
  oracleProofHash: string;
}

// Investment Types
export interface InvestmentPool {
  id: string;
  projectId: string;
  investmentGoal: number;
  currentInvestment: number;
  minInvestment: number;
  expectedAPY: number;
  expectedCarbonCredits: number;
  status: 'fundraising' | 'active' | 'completed' | 'closed';
  startDate: number;
  endDate: number;
  description: string;
  investors: InvestorPosition[];
}

export interface InvestorPosition {
  investor: string;
  amountInvested: number;
  tokensReceived: number;
  timestamp: number;
  claimedRewards: number;
}

// Portfolio Types
export interface UserPortfolio {
  walletAddress: string;
  totalCarbonOwned: number;
  totalCarbonRetired: number;
  portfolioValue: number;
  investmentValue: number;
  pendingOrders: number;
  completedTrades: number;
}

// Transaction Types
export interface TradeTransaction {
  id: string;
  from: string;
  to: string;
  amount: number;
  pricePerTonne: number;
  totalValue: number;
  timestamp: number;
  transactionHash: string;
  type: 'buy' | 'sell' | 'auction' | 'retirement';
  status: 'pending' | 'confirmed' | 'failed';
}

// Dashboard Types
export interface DashboardStats {
  totalCarbonOffsetted: number;
  totalTransactions: number;
  marketPrice: number;
  priceChange24h: number;
  activeOrders: number;
  totalUsers: number;
  totalValue: number;
}

export interface MarketData {
  symbol: string;
  name: string;
  price: number;
  change24h: number;
  changePercent24h: number;
  high24h: number;
  low24h: number;
  volume24h: number;
  marketCap: number;
}

// User Types
export interface User {
  walletAddress: string;
  username?: string;
  email?: string;
  kycVerified: boolean;
  kycLevel: 'none' | 'basic' | 'premium' | 'institutional';
  company?: Company;
  role: 'individual' | 'company' | 'verifier' | 'admin';
  joinedAt: number;
}

// API Response Types
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}
