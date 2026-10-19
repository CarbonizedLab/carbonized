export interface CompanyProfilePayload {
  walletAddress: string;
  name: string;
  legalEntityId: string;
  email: string;
  phone: string;
  scope1Emissions: number;
  scope2Emissions: number;
  scope3Emissions: number;
  registrationDate: number;
}

export interface CompanyProfile extends CompanyProfilePayload {
  updatedAt: number;
}

/**
 * Browser calls to the legacy backend are deliberately disabled until they can
 * be made through a server-authenticated design. The onchain registry is the
 * source of truth, and client-side profile/depository requests must not send
 * PII or retirement instructions to an arbitrary public URL.
 */
export const isBackendConfigured = (): boolean => false;

const LEGACY_BACKEND_DISABLED_MESSAGE =
  'The legacy backend is disabled until a server-authenticated integration is available.';

// ---------- Phase 4: Carbon Wallet — Depository API ----------

export interface DepositoryCredit {
  creditId: string;
  projectId: string;
  co2Amount: number;
  ownerId: string;
  status: 'Active' | 'Transferred' | 'Retired';
  methodology: string;
  vintageYear: number;
  geography: string;
  serialNumber: string;
  issuedAt: number;
  auditHash: string;
  retiredAt?: number;
  retirementReason?: string;
  verificationSourceId?: string;
  verifiedAt?: number;
  oracleProofHash?: string;
}

export interface DepositoryCreditsResponse {
  owner: string;
  credits: DepositoryCredit[];
}

export const fetchDepositoryCredits = (
  owner: string,
  _activeOnly = false
): Promise<DepositoryCreditsResponse> =>
  Promise.resolve({ owner, credits: [] });

export const retireDepositoryCredit = (
  _creditId: string,
  _retiredBy: string,
  _reason = ''
): Promise<{ credit: DepositoryCredit; sequenceId: number }> =>
  Promise.reject(new Error(LEGACY_BACKEND_DISABLED_MESSAGE));

/** Derive official account number from wallet address (CBZ-ACC-XXXXXXXXXXXX). */
export const getCarbonAccountNumber = (walletAddress: string): string => {
  if (!walletAddress || walletAddress.length < 14) {
    return 'CBZ-ACC-N/A';
  }
  return `CBZ-ACC-${walletAddress.slice(2, 14).toUpperCase()}`;
};

/** Register claimed company credits in the official Carbon Wallet (depository). Call after onchain claim. */
export const registerClaimCreditsInDepository = (
  _ownerId: string
): Promise<{ registered: number; credits: unknown[] }> =>
  Promise.reject(new Error(LEGACY_BACKEND_DISABLED_MESSAGE));

export const fetchCompanyProfile = (_walletAddress: string): Promise<null> =>
  Promise.resolve(null);

export const saveCompanyProfile = (
  _payload: CompanyProfilePayload
): Promise<never> => Promise.reject(new Error(LEGACY_BACKEND_DISABLED_MESSAGE));
