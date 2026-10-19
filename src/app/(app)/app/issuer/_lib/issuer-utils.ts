import {
  type Address,
  type Hex,
  isAddress,
  keccak256,
  stringToHex,
  zeroHash,
} from 'viem';

/** Methodology labels with a CCT pool (`CarbonCreditToken` only wraps an exact match). */
export const METHODOLOGIES = [
  'ICM_COMPLIANCE',
  'VERRA_VCS',
  'GOLD_STANDARD',
] as const;

export type IssuerMethodology = (typeof METHODOLOGIES)[number];

/** `CarbonCreditNFT.MAX_TONNES_PER_CREDIT` (10,000,000 tonnes); issuance is whole tonnes only. */
export const MAX_TONNES_PER_CREDIT = 10_000_000;
/** `CarbonCreditNFT.MIN_VINTAGE_YEAR` / `MAX_VINTAGE_YEAR`. */
export const MIN_VINTAGE_YEAR = 2015;
export const MAX_VINTAGE_YEAR = 2050;
/**
 * Credits per `batchMint` transaction. The contract allows 100, but one credit costs about
 * 0.49M gas and the chain caps a transaction near 16.7M gas, so 25 leaves a wide margin.
 */
export const MAX_CREDITS_PER_TX = 25;

const TONNE_UNIT = 10n ** 18n;
const MAX_FILE_BYTES = 256 * 1024 * 1024;

export const NATIVE_ISSUER_ROLE: Hex = keccak256(
  stringToHex('NATIVE_ISSUER_ROLE')
);
/** OpenZeppelin `DEFAULT_ADMIN_ROLE` is the zero hash. */
export const DEFAULT_ADMIN_ROLE: Hex = zeroHash;

const DIGITS_PATTERN = /^\d+$/;
const HASH_PATTERN = /^0x[0-9a-fA-F]{64}$/;
const ZERO_HASH_PATTERN = /^0x0{64}$/;
const URI_PATTERN = /^(?:ipfs|https|ar):\/\/\S+$/i;
const NO_SPACE_PATTERN = /^\S+$/;
const EDGE_WHITESPACE_PATTERN = /^[ \t\n\r]+|[ \t\n\r]+$/g;
const LOWERCASE_ASCII_PATTERN = /[a-z]/g;
const ADDRESS_PATTERN = /^0x[a-fA-F0-9]{40}$/;
const ZERO_ADDRESS_PATTERN = /^0x0{40}$/;
const COLUMN_NAME_STRIP_PATTERN = /[^a-z0-9]/g;
const LINE_SPLIT_PATTERN = /\r\n|\r|\n/;
const BLANK_LINE_PATTERN = /^\s*$/;

export interface CreditDraft {
  projectId: string;
  projectName: string;
  serialNumber: string;
  methodology: string;
  /** Whole tonnes, as typed. */
  tonnes: string;
  vintageYear: string;
  geography: string;
  /** bytes32, 0x-prefixed hex. */
  oracleProofHash: string;
  satelliteDataCID: string;
  tokenURI: string;
}

export type DraftField = keyof CreditDraft;

export const DRAFT_FIELDS: readonly DraftField[] = [
  'projectId',
  'projectName',
  'serialNumber',
  'methodology',
  'tonnes',
  'vintageYear',
  'geography',
  'oracleProofHash',
  'satelliteDataCID',
  'tokenURI',
];

export const EMPTY_DRAFT: CreditDraft = {
  projectId: '',
  projectName: '',
  serialNumber: '',
  methodology: METHODOLOGIES[1],
  tonnes: '',
  vintageYear: '',
  geography: '',
  oracleProofHash: '',
  satelliteDataCID: '',
  tokenURI: '',
};

/** Message-key suffixes (`err.<code>`) for field validation failures. */
export type FieldError =
  | 'required'
  | 'methodology'
  | 'tonnes'
  | 'vintage'
  | 'hash'
  | 'zeroHash'
  | 'uri'
  | 'cid'
  | 'address';

export type DraftErrors = Partial<Record<DraftField, FieldError>>;

export const isConfiguredAddress = (value: string): value is Address =>
  ADDRESS_PATTERN.test(value) && !ZERO_ADDRESS_PATTERN.test(value);

/** True for a syntactically valid, non-zero address (checksum is enforced when mixed-case). */
export const isValidRecipient = (value: string): value is Address =>
  isAddress(value) && !ZERO_ADDRESS_PATTERN.test(value);

/**
 * Mirrors the contract's canonical double-counting key input: trims ASCII whitespace and
 * upper-cases a-z only. The contract hashes this string; `isSerialTokenized` is the
 * authoritative check, this is for display and for finding duplicates inside a batch.
 */
export const canonicalSerial = (serial: string): string =>
  serial
    .replace(EDGE_WHITESPACE_PATTERN, '')
    .replace(LOWERCASE_ASCII_PATTERN, (char) => char.toUpperCase());

export const isMethodology = (value: string): value is IssuerMethodology =>
  (METHODOLOGIES as readonly string[]).includes(value);

const validateTonnes = (value: string): FieldError | undefined => {
  const trimmed = value.trim();
  if (trimmed === '') {
    return 'required';
  }
  if (!DIGITS_PATTERN.test(trimmed)) {
    return 'tonnes';
  }
  const parsed = BigInt(trimmed);
  return parsed >= 1n && parsed <= BigInt(MAX_TONNES_PER_CREDIT)
    ? undefined
    : 'tonnes';
};

const validateVintage = (value: string): FieldError | undefined => {
  const trimmed = value.trim();
  if (trimmed === '') {
    return 'required';
  }
  if (!DIGITS_PATTERN.test(trimmed)) {
    return 'vintage';
  }
  const year = Number(trimmed);
  return year >= MIN_VINTAGE_YEAR && year <= MAX_VINTAGE_YEAR
    ? undefined
    : 'vintage';
};

const validateProofHash = (value: string): FieldError | undefined => {
  const trimmed = value.trim();
  if (trimmed === '') {
    return 'required';
  }
  if (!HASH_PATTERN.test(trimmed)) {
    return 'hash';
  }
  return ZERO_HASH_PATTERN.test(trimmed) ? 'zeroHash' : undefined;
};

const validateTokenUri = (value: string): FieldError | undefined => {
  const trimmed = value.trim();
  if (trimmed === '') {
    return 'required';
  }
  return URI_PATTERN.test(trimmed) ? undefined : 'uri';
};

const validateCid = (value: string): FieldError | undefined => {
  const trimmed = value.trim();
  return trimmed === '' || NO_SPACE_PATTERN.test(trimmed) ? undefined : 'cid';
};

/** Same limits as `CarbonCreditNFT._issueCredit` plus the fields the UI additionally requires. */
export const validateDraft = (draft: CreditDraft): DraftErrors => {
  const errors: DraftErrors = {};
  const required: DraftField[] = [
    'projectId',
    'projectName',
    'serialNumber',
    'geography',
  ];
  for (const field of required) {
    if (canonicalSerial(draft[field]) === '') {
      errors[field] = 'required';
    }
  }
  if (!isMethodology(draft.methodology)) {
    errors.methodology = 'methodology';
  }
  const checks: [DraftField, FieldError | undefined][] = [
    ['tonnes', validateTonnes(draft.tonnes)],
    ['vintageYear', validateVintage(draft.vintageYear)],
    ['oracleProofHash', validateProofHash(draft.oracleProofHash)],
    ['tokenURI', validateTokenUri(draft.tokenURI)],
    ['satelliteDataCID', validateCid(draft.satelliteDataCID)],
  ];
  for (const [field, error] of checks) {
    if (error) {
      errors[field] = error;
    }
  }
  return errors;
};

export const hasErrors = (errors: DraftErrors): boolean =>
  Object.keys(errors).length > 0;

/** `CarbonCreditNFT.CreditData` as sent to `batchMint`. */
export interface CreditData {
  projectName: string;
  serialNumber: string;
  methodology: string;
  co2Tonnes: bigint;
  vintageYear: bigint;
  geography: string;
  oracleProofHash: Hex;
  satelliteDataCID: string;
  tokenURI: string;
}

/** Converts a VALID draft (see `validateDraft`) into contract arguments (tonnes scaled to 18 decimals). */
export const toCreditData = (draft: CreditDraft): CreditData => ({
  projectName: draft.projectName.trim(),
  serialNumber: draft.serialNumber.trim(),
  methodology: draft.methodology,
  co2Tonnes: BigInt(draft.tonnes.trim()) * TONNE_UNIT,
  vintageYear: BigInt(draft.vintageYear.trim()),
  geography: draft.geography.trim(),
  oracleProofHash: draft.oracleProofHash.trim() as Hex,
  satelliteDataCID: draft.satelliteDataCID.trim(),
  tokenURI: draft.tokenURI.trim(),
});

const toHex = (buffer: ArrayBuffer): Hex => {
  let out = '';
  for (const byte of new Uint8Array(buffer)) {
    out += byte.toString(16).padStart(2, '0');
  }
  return `0x${out}`;
};

/** SHA-256 of a file, computed in the browser. The file never leaves the device. */
export const sha256OfFile = async (file: File): Promise<Hex> => {
  if (file.size > MAX_FILE_BYTES) {
    throw new Error('File is larger than 256 MiB.');
  }
  return toHex(await crypto.subtle.digest('SHA-256', await file.arrayBuffer()));
};

/** SHA-256 of a text, used as a stable key for resumable batch progress. */
export const sha256OfText = async (text: string): Promise<Hex> =>
  toHex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)));

// ---------------------------------------------------------------------------
// CSV
// ---------------------------------------------------------------------------

const CRLF_PATTERN = /\r\n?/g;

/** Reads a quoted field starting at the opening quote; `""` is an escaped quote. */
const readQuoted = (
  input: string,
  start: number
): { value: string; next: number } => {
  let value = '';
  let index = start + 1;
  while (index < input.length) {
    const char = input.charAt(index);
    if (char !== '"') {
      value += char;
      index++;
    } else if (input.charAt(index + 1) === '"') {
      value += '"';
      index += 2;
    } else {
      return { value, next: index + 1 };
    }
  }
  return { value, next: index };
};

/**
 * Minimal RFC 4180 reader: quoted fields, doubled quotes, CRLF. `delimiter` is a comma or a tab
 * (pasted spreadsheet cells). Blank lines are dropped.
 */
export const parseDelimited = (text: string, delimiter: string): string[][] => {
  const input = text.replace(CRLF_PATTERN, '\n');
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';

  const endField = () => {
    row.push(field);
    field = '';
  };
  const endRow = () => {
    endField();
    if (!(row.length === 1 && BLANK_LINE_PATTERN.test(row[0] ?? ''))) {
      rows.push(row);
    }
    row = [];
  };

  let index = 0;
  while (index < input.length) {
    const char = input.charAt(index);
    if (char === '"' && field === '') {
      const quoted = readQuoted(input, index);
      field = quoted.value;
      index = quoted.next;
      continue;
    }
    index++;
    if (char === delimiter) {
      endField();
    } else if (char === '\n') {
      endRow();
    } else {
      field += char;
    }
  }
  if (field !== '' || row.length > 0) {
    endRow();
  }
  return rows;
};

const COLUMN_ALIASES: Record<string, DraftField> = {
  projectid: 'projectId',
  project: 'projectId',
  projectname: 'projectName',
  name: 'projectName',
  serialnumber: 'serialNumber',
  serial: 'serialNumber',
  methodology: 'methodology',
  standard: 'methodology',
  tonnes: 'tonnes',
  co2tonnes: 'tonnes',
  tco2: 'tonnes',
  vintageyear: 'vintageYear',
  vintage: 'vintageYear',
  geography: 'geography',
  country: 'geography',
  oracleproofhash: 'oracleProofHash',
  proofhash: 'oracleProofHash',
  evidencehash: 'oracleProofHash',
  satellitedatacid: 'satelliteDataCID',
  satellitecid: 'satelliteDataCID',
  cid: 'satelliteDataCID',
  tokenuri: 'tokenURI',
  metadata: 'tokenURI',
  metadataurl: 'tokenURI',
  uri: 'tokenURI',
};

const normalizeColumnName = (name: string): string =>
  name.toLowerCase().replace(COLUMN_NAME_STRIP_PATTERN, '');

export interface ParsedCsvRow {
  /** 1-based line number in the pasted text (header counts as line 1 when present). */
  line: number;
  draft: CreditDraft;
}

export interface ParsedCsv {
  rows: ParsedCsvRow[];
  /** Header names that matched no known column (ignored). */
  unknownColumns: string[];
  /** Required columns missing from the header. */
  missingColumns: DraftField[];
}

const REQUIRED_COLUMNS: readonly DraftField[] = DRAFT_FIELDS.filter(
  (field) => field !== 'satelliteDataCID'
);

/**
 * Parses pasted / uploaded CSV (or tab-separated) text. A header row is detected when its cells
 * name known columns; otherwise columns are positional in `DRAFT_FIELDS` order.
 */
export const parseCreditCsv = (text: string): ParsedCsv => {
  const firstLine = text
    .split(LINE_SPLIT_PATTERN)
    .find((line) => !BLANK_LINE_PATTERN.test(line));
  const delimiter = firstLine?.includes('\t') ? '\t' : ',';
  const table = parseDelimited(text, delimiter);
  const first = table[0] ?? [];
  const mapped = first.map((cell) => COLUMN_ALIASES[normalizeColumnName(cell)]);
  const hasHeader = mapped.filter(Boolean).length >= 3;

  const columns: (DraftField | undefined)[] = hasHeader
    ? mapped
    : [...DRAFT_FIELDS];
  const unknownColumns = hasHeader
    ? first.filter((_, index) => !mapped[index])
    : [];
  const missingColumns = REQUIRED_COLUMNS.filter(
    (field) => !columns.includes(field)
  );

  const rows: ParsedCsvRow[] = [];
  const body = hasHeader ? table.slice(1) : table;
  const lineOffset = hasHeader ? 2 : 1;
  body.forEach((cells, index) => {
    const draft: CreditDraft = { ...EMPTY_DRAFT, methodology: '' };
    columns.forEach((field, column) => {
      if (field) {
        draft[field] = (cells[column] ?? '').trim();
      }
    });
    rows.push({ line: index + lineOffset, draft });
  });
  return { rows, unknownColumns, missingColumns };
};

// ---------------------------------------------------------------------------
// Chunking
// ---------------------------------------------------------------------------

export interface BatchChunk {
  index: number;
  projectId: string;
  /** Source lines in the pasted CSV, for the progress table. */
  lines: number[];
  credits: CreditData[];
  totalTonnes: number;
}

/**
 * Groups validated rows by project (one `batchMint` call carries a single project id) and
 * splits each project into transactions of at most `MAX_CREDITS_PER_TX` credits, keeping the
 * order of the pasted rows within a project.
 */
export const buildChunks = (rows: ParsedCsvRow[]): BatchChunk[] => {
  const byProject = new Map<string, ParsedCsvRow[]>();
  for (const row of rows) {
    const projectId = row.draft.projectId.trim();
    const list = byProject.get(projectId) ?? [];
    list.push(row);
    byProject.set(projectId, list);
  }
  const chunks: BatchChunk[] = [];
  for (const [projectId, list] of byProject) {
    for (let start = 0; start < list.length; start += MAX_CREDITS_PER_TX) {
      const slice = list.slice(start, start + MAX_CREDITS_PER_TX);
      chunks.push({
        index: chunks.length,
        projectId,
        lines: slice.map((row) => row.line),
        credits: slice.map((row) => toCreditData(row.draft)),
        totalTonnes: slice.reduce(
          (sum, row) => sum + Number(row.draft.tonnes.trim()),
          0
        ),
      });
    }
  }
  return chunks;
};
