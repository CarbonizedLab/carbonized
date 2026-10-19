/** ISO 14064 readiness checklist state, persisted per wallet in localStorage. */

export const ISO_ITEMS = [
  'boundary',
  'baseYear',
  'sources',
  'dataQuality',
  'report',
  'verification',
] as const;

export type IsoItemId = (typeof ISO_ITEMS)[number];

export interface IsoState {
  checks: Record<IsoItemId, boolean>;
  baseYear: string;
  auditor: string;
  verifiedOn: string;
  docHash: string;
}

const STORAGE_PREFIX = 'carb-iso14064:v1';
const MIN_BASE_YEAR = 1990;
const MAX_FIELD_LENGTH = 200;

/** 0x-prefixed 32-byte hex digest, or an IPFS CIDv0 / CIDv1 (base32). */
const DOC_HASH_PATTERN =
  /^(?:0x[a-fA-F0-9]{64}|Qm[1-9A-HJ-NP-Za-km-z]{44}|b[a-z2-7]{50,})$/;
const BASE_YEAR_PATTERN = /^\d{4}$/;

export const emptyIsoState = (): IsoState => ({
  checks: {
    boundary: false,
    baseYear: false,
    sources: false,
    dataQuality: false,
    report: false,
    verification: false,
  },
  baseYear: '',
  auditor: '',
  verifiedOn: '',
  docHash: '',
});

const readString = (value: unknown): string =>
  typeof value === 'string' ? value.slice(0, MAX_FIELD_LENGTH) : '';

export const loadIsoState = (address: string): IsoState => {
  const base = emptyIsoState();
  try {
    const raw = window.localStorage.getItem(
      `${STORAGE_PREFIX}:${address.toLowerCase()}`
    );
    if (!raw) {
      return base;
    }
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) {
      return base;
    }
    const checks = 'checks' in parsed ? parsed.checks : null;
    if (typeof checks === 'object' && checks !== null) {
      for (const id of ISO_ITEMS) {
        base.checks[id] = Reflect.get(checks, id) === true;
      }
    }
    return {
      ...base,
      baseYear: 'baseYear' in parsed ? readString(parsed.baseYear) : '',
      auditor: 'auditor' in parsed ? readString(parsed.auditor) : '',
      verifiedOn: 'verifiedOn' in parsed ? readString(parsed.verifiedOn) : '',
      docHash: 'docHash' in parsed ? readString(parsed.docHash) : '',
    };
  } catch {
    return base;
  }
};

export const saveIsoState = (address: string, state: IsoState): boolean => {
  try {
    window.localStorage.setItem(
      `${STORAGE_PREFIX}:${address.toLowerCase()}`,
      JSON.stringify(state)
    );
    return true;
  } catch {
    return false;
  }
};

export const isValidDocHash = (value: string): boolean =>
  DOC_HASH_PATTERN.test(value.trim());

export const isValidBaseYear = (value: string, maxYear: number): boolean => {
  if (!BASE_YEAR_PATTERN.test(value)) {
    return false;
  }
  const year = Number(value);
  return year >= MIN_BASE_YEAR && year <= maxYear;
};

export interface IsoFieldErrors {
  baseYear: boolean;
  auditor: boolean;
  verifiedOn: boolean;
  docHash: boolean;
}

/** Fields that a ticked item still needs before it counts as complete. */
export const getFieldErrors = (
  state: IsoState,
  maxYear: number
): IsoFieldErrors => ({
  baseYear:
    state.checks.baseYear && !isValidBaseYear(state.baseYear.trim(), maxYear),
  auditor: state.checks.verification && state.auditor.trim() === '',
  verifiedOn: state.checks.verification && state.verifiedOn === '',
  docHash: state.checks.verification && !isValidDocHash(state.docHash),
});

/** Items that are checked AND have all their supporting details. */
export const getCompletedItems = (
  state: IsoState,
  maxYear: number,
  hasTrackerData: boolean
): IsoItemId[] => {
  const errors = getFieldErrors(state, maxYear);
  return ISO_ITEMS.filter((id) => {
    if (id === 'sources') {
      return hasTrackerData || state.checks.sources;
    }
    if (id === 'baseYear') {
      return state.checks.baseYear && !errors.baseYear;
    }
    if (id === 'verification') {
      return (
        state.checks.verification &&
        !(errors.auditor || errors.verifiedOn || errors.docHash)
      );
    }
    return state.checks[id];
  });
};
