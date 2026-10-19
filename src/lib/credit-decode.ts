import { CCT_DECIMALS, toDisplayNumber } from '@/lib/token-units';
import type { CarbonCredit } from '@/types/carb';

/** Return value of `CarbonCreditNFT.credits(tokenId)` (same field order as the Solidity struct). */
export type CreditTuple = readonly [
  string, // projectId
  string, // projectName
  string, // methodology
  bigint, // co2Tonnes (18 decimals)
  bigint, // vintageYear
  string, // geography
  `0x${string}`, // oracleProofHash
  string, // satelliteDataCID
  `0x${string}`, // verificationSource (issuer)
  bigint, // verificationDate
  boolean, // isRetired
  bigint, // issuanceDate
  string, // serialNumber
];

/**
 * Chain tuple -> UI credit. The serial and proof hash are passed through exactly as
 * stored: an empty serial / zero hash must stay visible so the UI can explain why the
 * credit cannot be wrapped, never be replaced by a placeholder.
 */
export const creditFromTuple = (
  tokenId: number,
  details: CreditTuple
): CarbonCredit => ({
  id: String(tokenId),
  tokenId,
  projectId: details[0] || `proj-${tokenId}`,
  projectName: details[1] || `Project ${tokenId}`,
  methodology: details[2] as CarbonCredit['methodology'],
  co2Tonnes: toDisplayNumber(details[3], CCT_DECIMALS),
  vintageYear: Number(details[4]),
  geography: details[5] || 'Unknown',
  verificationDate: Number(details[9]),
  isRetired: details[10],
  issuanceDate: Number(details[11]),
  serialNumber: details[12],
  oracleProofHash: details[6],
});
