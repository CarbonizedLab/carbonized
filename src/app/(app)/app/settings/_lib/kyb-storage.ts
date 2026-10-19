export const KYB_DOCUMENTS = [
  'registration',
  'taxId',
  'articles',
  'directors',
] as const;

export type KybDocumentId = (typeof KYB_DOCUMENTS)[number];

/** What is kept locally per document. The file itself is never stored or uploaded. */
export interface KybEntry {
  fileName: string;
  size: number;
  /** Lowercase hex SHA-256 of the file bytes. */
  sha256: string;
  /** ISO timestamp. */
  hashedAt: string;
}

export type KybState = Partial<Record<KybDocumentId, KybEntry>>;

/** Files above this size are rejected to keep hashing in-memory and fast. */
export const MAX_KYB_FILE_BYTES = 25 * 1024 * 1024;

const storageKey = (account: string): string =>
  `carb-kyb:${account.toLowerCase()}`;

const isEntry = (value: unknown): value is KybEntry =>
  typeof value === 'object' &&
  value !== null &&
  'fileName' in value &&
  'sha256' in value &&
  'hashedAt' in value &&
  'size' in value &&
  typeof value.fileName === 'string' &&
  typeof value.sha256 === 'string' &&
  typeof value.hashedAt === 'string' &&
  typeof value.size === 'number';

export const loadKyb = (account: string): KybState => {
  try {
    const raw = window.localStorage.getItem(storageKey(account));
    if (!raw) {
      return {};
    }
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) {
      return {};
    }
    const state: KybState = {};
    for (const id of KYB_DOCUMENTS) {
      const entry = (parsed as Record<string, unknown>)[id];
      if (isEntry(entry)) {
        state[id] = entry;
      }
    }
    return state;
  } catch {
    return {};
  }
};

export const saveKyb = (account: string, state: KybState): void => {
  try {
    window.localStorage.setItem(storageKey(account), JSON.stringify(state));
  } catch {
    // storage unavailable or full; the in-memory state still works this session
  }
};

/** SHA-256 of a file computed in the browser with Web Crypto. Throws when unavailable. */
export const sha256Hex = async (file: File): Promise<string> => {
  const subtle = window.crypto?.subtle;
  if (!subtle) {
    throw new Error(
      'crypto.subtle is unavailable (HTTPS or localhost required).'
    );
  }
  const digest = await subtle.digest('SHA-256', await file.arrayBuffer());
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, '0')
  ).join('');
};
