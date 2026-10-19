import type { Locale } from '@/lib/i18n';

/**
 * GHG Protocol activity ledger used by the Emissions tracker and the
 * Assessment page. Data lives in `localStorage`, keyed by wallet + year.
 * All emission factors are kgCO2e per unit of activity.
 */

export type EmissionScope = 1 | 2 | 3;

export type EmissionUnit = 'litre' | 'm3' | 'kg' | 'kwh' | 'km' | 'tkm' | 'usd';

export interface EmissionFactor {
  id: string;
  scope: EmissionScope;
  unit: EmissionUnit;
  /** kgCO2e per unit. */
  factor: number;
  /** Short citation shown in the UI. Values are rounded averages. */
  source: string;
}

export const GRID_FACTOR_ID = 'grid_electricity';

/** Indonesia (PLN) location-based grid average, kgCO2e per kWh. */
export const DEFAULT_GRID_FACTOR = 0.87;

export const GRID_FACTOR_SOURCE =
  'Indonesia national grid average (PLN / ESDM), location-based';

export const EMISSION_FACTORS: readonly EmissionFactor[] = [
  {
    id: 'diesel_genset',
    scope: 1,
    unit: 'litre',
    factor: 2.68,
    source: 'IPCC 2006 / DEFRA, diesel',
  },
  {
    id: 'natural_gas',
    scope: 1,
    unit: 'm3',
    factor: 2.02,
    source: 'DEFRA, natural gas',
  },
  {
    id: 'fleet_gasoline',
    scope: 1,
    unit: 'litre',
    factor: 2.31,
    source: 'DEFRA, petrol',
  },
  {
    id: 'fleet_diesel',
    scope: 1,
    unit: 'litre',
    factor: 2.68,
    source: 'IPCC 2006 / DEFRA, diesel',
  },
  {
    id: 'refrigerant_r410a',
    scope: 1,
    unit: 'kg',
    factor: 2088,
    source: 'IPCC AR4 GWP-100, R-410A',
  },
  {
    id: 'refrigerant_r134a',
    scope: 1,
    unit: 'kg',
    factor: 1430,
    source: 'IPCC AR4 GWP-100, R-134a',
  },
  {
    id: GRID_FACTOR_ID,
    scope: 2,
    unit: 'kwh',
    factor: DEFAULT_GRID_FACTOR,
    source: GRID_FACTOR_SOURCE,
  },
  {
    id: 'travel_air_short',
    scope: 3,
    unit: 'km',
    factor: 0.151,
    source: 'DEFRA, short-haul flight (per passenger-km)',
  },
  {
    id: 'travel_air_long',
    scope: 3,
    unit: 'km',
    factor: 0.148,
    source: 'DEFRA, long-haul flight (per passenger-km)',
  },
  {
    id: 'travel_car',
    scope: 3,
    unit: 'km',
    factor: 0.171,
    source: 'DEFRA, average car / taxi',
  },
  {
    id: 'travel_rail',
    scope: 3,
    unit: 'km',
    factor: 0.035,
    source: 'DEFRA, national rail',
  },
  {
    id: 'travel_bus',
    scope: 3,
    unit: 'km',
    factor: 0.103,
    source: 'DEFRA, local bus',
  },
  {
    id: 'freight_road',
    scope: 3,
    unit: 'tkm',
    factor: 0.107,
    source: 'DEFRA, average HGV',
  },
  {
    id: 'freight_sea',
    scope: 3,
    unit: 'tkm',
    factor: 0.016,
    source: 'DEFRA, container ship',
  },
  {
    id: 'freight_air',
    scope: 3,
    unit: 'tkm',
    factor: 0.602,
    source: 'DEFRA, air freight',
  },
  {
    id: 'purchased_goods',
    scope: 3,
    unit: 'usd',
    factor: 0.4,
    source: 'Generic spend-based average (EEIO); replace with supplier data',
  },
  {
    id: 'waste_landfill',
    scope: 3,
    unit: 'kg',
    factor: 0.46,
    source: 'DEFRA, mixed waste to landfill',
  },
] as const;

export const SCOPES: readonly EmissionScope[] = [1, 2, 3] as const;

export const getFactor = (id: string): EmissionFactor | undefined =>
  EMISSION_FACTORS.find((factor) => factor.id === id);

export interface EmissionRecord {
  id: string;
  /** 1-12. */
  month: number;
  factorId: string;
  quantity: number;
  /** kgCO2e per unit snapshot used when the record was created. */
  factor: number;
  kgCo2e: number;
  note: string;
  createdAt: number;
}

export interface EmissionsLedger {
  records: EmissionRecord[];
  /** Editable Scope 2 grid factor, kgCO2e/kWh. */
  gridFactor: number;
}

export interface ScopeTotals {
  scope1: number;
  scope2: number;
  scope3: number;
  total: number;
}

export interface MonthlyBreakdown {
  month: number;
  scope1: number;
  scope2: number;
  scope3: number;
}

const KG_PER_TONNE = 1000;
const MONTHS = 12;
const STORAGE_PREFIX = 'carb-emissions:v1';

export const emptyLedger = (): EmissionsLedger => ({
  records: [],
  gridFactor: DEFAULT_GRID_FACTOR,
});

const storageKey = (address: string, year: number): string =>
  `${STORAGE_PREFIX}:${address.toLowerCase()}:${year}`;

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const isEmissionRecord = (value: unknown): value is EmissionRecord => {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.factorId === 'string' &&
    isFiniteNumber(candidate.month) &&
    isFiniteNumber(candidate.quantity) &&
    isFiniteNumber(candidate.factor) &&
    isFiniteNumber(candidate.kgCo2e) &&
    typeof candidate.note === 'string' &&
    isFiniteNumber(candidate.createdAt)
  );
};

export const loadLedger = (address: string, year: number): EmissionsLedger => {
  try {
    const raw = window.localStorage.getItem(storageKey(address, year));
    if (!raw) {
      return emptyLedger();
    }
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) {
      return emptyLedger();
    }
    const { records, gridFactor } = parsed as Record<string, unknown>;
    return {
      records: Array.isArray(records) ? records.filter(isEmissionRecord) : [],
      gridFactor:
        isFiniteNumber(gridFactor) && gridFactor > 0
          ? gridFactor
          : DEFAULT_GRID_FACTOR,
    };
  } catch {
    return emptyLedger();
  }
};

export const saveLedger = (
  address: string,
  year: number,
  ledger: EmissionsLedger
): boolean => {
  try {
    window.localStorage.setItem(
      storageKey(address, year),
      JSON.stringify(ledger)
    );
    return true;
  } catch {
    return false;
  }
};

/** Totals in tonnes CO2e. */
export const sumByScope = (records: readonly EmissionRecord[]): ScopeTotals => {
  const kg = { 1: 0, 2: 0, 3: 0 };
  for (const record of records) {
    const scope = getFactor(record.factorId)?.scope;
    if (scope) {
      kg[scope] += record.kgCo2e;
    }
  }
  const scope1 = kg[1] / KG_PER_TONNE;
  const scope2 = kg[2] / KG_PER_TONNE;
  const scope3 = kg[3] / KG_PER_TONNE;
  return { scope1, scope2, scope3, total: scope1 + scope2 + scope3 };
};

/** Twelve entries (Jan..Dec) in tonnes CO2e. */
export const monthlyBreakdown = (
  records: readonly EmissionRecord[]
): MonthlyBreakdown[] => {
  const months: MonthlyBreakdown[] = Array.from({ length: MONTHS }, (_, i) => ({
    month: i + 1,
    scope1: 0,
    scope2: 0,
    scope3: 0,
  }));
  for (const record of records) {
    const scope = getFactor(record.factorId)?.scope;
    const bucket = months[record.month - 1];
    if (scope && bucket) {
      bucket[`scope${scope}`] += record.kgCo2e / KG_PER_TONNE;
    }
  }
  return months;
};

const CSV_NEEDS_QUOTES = /[",\r\n]/;
const CSV_FORMULA_PREFIX = /^[=+\-@\t\r]/;

/** RFC 4180 escaping plus spreadsheet formula-injection protection. */
export const escapeCsvCell = (value: string | number): string => {
  let text = String(value);
  if (typeof value === 'string' && CSV_FORMULA_PREFIX.test(text)) {
    text = `'${text}`;
  }
  return CSV_NEEDS_QUOTES.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
};

const CSV_HEADER = [
  'year',
  'month',
  'scope',
  'category',
  'quantity',
  'unit',
  'factor_kgco2e_per_unit',
  'kgco2e',
  'tco2e',
  'note',
] as const;

export const recordsToCsv = (
  records: readonly EmissionRecord[],
  year: number
): string => {
  const rows: string[] = [CSV_HEADER.join(',')];
  for (const record of records) {
    const definition = getFactor(record.factorId);
    rows.push(
      [
        year,
        record.month,
        definition?.scope ?? '',
        record.factorId,
        record.quantity,
        definition?.unit ?? '',
        record.factor,
        record.kgCo2e.toFixed(3),
        (record.kgCo2e / KG_PER_TONNE).toFixed(6),
        record.note,
      ]
        .map(escapeCsvCell)
        .join(',')
    );
  }
  return `${rows.join('\r\n')}\r\n`;
};

/** Triggers a client-side download of `content` as a UTF-8 CSV file. */
export const downloadCsv = (filename: string, content: string): void => {
  const blob = new Blob([`\uFEFF${content}`], {
    type: 'text/csv;charset=utf-8',
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
};

const numberFormats = new Map<string, Intl.NumberFormat>();

/** Locale-aware number formatting with a cached `Intl.NumberFormat`. */
export const formatNumber = (
  value: number,
  locale: Locale,
  maximumFractionDigits = 2
): string => {
  const key = `${locale}:${maximumFractionDigits}`;
  let formatter = numberFormats.get(key);
  if (!formatter) {
    formatter = new Intl.NumberFormat(locale === 'zh' ? 'zh-CN' : 'en-US', {
      maximumFractionDigits,
    });
    numberFormats.set(key, formatter);
  }
  return formatter.format(value);
};

/** Localized month name for a 1-based month number. */
export const formatMonth = (
  month: number,
  locale: Locale,
  style: 'short' | 'long' = 'short'
): string =>
  new Intl.DateTimeFormat(locale === 'zh' ? 'zh-CN' : 'en-US', {
    month: style,
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(2000, month - 1, 1)));
