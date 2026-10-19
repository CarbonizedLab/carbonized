'use client';

import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { TranslateFn } from '@/lib/i18n';
import {
  canonicalSerial,
  type DraftErrors,
  type DraftField,
  MAX_TONNES_PER_CREDIT,
  MAX_VINTAGE_YEAR,
  MIN_VINTAGE_YEAR,
  type ParsedCsvRow,
  validateDraft,
} from '../_lib/issuer-utils';
import type { ChainStatus } from '../_lib/use-issuer-data';

const PREVIEW_ROWS = 200;

const FIELD_LABEL_KEY: Record<DraftField, string> = {
  projectId: 'f.projectId',
  projectName: 'f.projectName',
  serialNumber: 'f.serial',
  methodology: 'f.methodology',
  tonnes: 'f.tonnes',
  vintageYear: 'f.vintage',
  geography: 'f.geography',
  oracleProofHash: 'f.proof',
  satelliteDataCID: 'f.cid',
  tokenURI: 'f.uri',
};

export interface RowAnalysis {
  row: ParsedCsvRow;
  errors: DraftErrors;
  /** Line of the first row in this CSV that uses the same canonical serial. */
  duplicateOf?: number;
}

export type RowChainStatus = ChainStatus | 'issued' | null;

/** Field-level validation + in-file duplicate detection for every CSV row. */
export const analyzeRows = (rows: ParsedCsvRow[]): RowAnalysis[] => {
  const firstLineBySerial: Record<string, number> = {};
  return rows.map((row) => {
    const errors = validateDraft(row.draft);
    const key = canonicalSerial(row.draft.serialNumber);
    let duplicateOf: number | undefined;
    if (key !== '') {
      duplicateOf = firstLineBySerial[key];
      firstLineBySerial[key] ??= row.line;
    }
    return { row, errors, duplicateOf };
  });
};

const rowIssue = (item: RowAnalysis, t: TranslateFn): string | null => {
  const first = Object.entries(item.errors)[0];
  if (first) {
    const [field, code] = first;
    return `${t(FIELD_LABEL_KEY[field as DraftField])}: ${t(`err.${code}`, {
      max: MAX_TONNES_PER_CREDIT.toLocaleString('en-US'),
      minYear: MIN_VINTAGE_YEAR,
      maxYear: MAX_VINTAGE_YEAR,
    })}`;
  }
  return item.duplicateOf
    ? t('batch.dupInFile', { line: item.duplicateOf })
    : null;
};

/** Validation problem for a row, or its onchain duplicate-check state. */
const RowStatus = ({
  item,
  status,
  t,
}: {
  item: RowAnalysis;
  status: RowChainStatus;
  t: TranslateFn;
}) => {
  const issue = rowIssue(item, t);
  if (issue) {
    return <span className='text-destructive text-xs'>{issue}</span>;
  }
  const bad = status === 'taken' || status === 'error';
  return (
    <Badge
      className={
        bad ? 'border-destructive/50 text-destructive' : 'rounded-none'
      }
      variant='outline'
    >
      {status ? t(`batch.row.${status}`) : ''}
    </Badge>
  );
};

interface PreviewTableProps {
  rows: RowAnalysis[];
  statusOf: (item: RowAnalysis) => RowChainStatus;
  t: TranslateFn;
}

export const PreviewTable = ({ rows, statusOf, t }: PreviewTableProps) => (
  <div className='space-y-2'>
    <h3 className='font-medium text-sm'>
      {t('batch.preview', { count: rows.length })}
    </h3>
    <div className='max-h-96 overflow-auto border border-dashed'>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t('batch.col.line')}</TableHead>
            <TableHead>{t('f.projectId')}</TableHead>
            <TableHead>{t('f.serial')}</TableHead>
            <TableHead>{t('f.methodology')}</TableHead>
            <TableHead className='text-right'>{t('f.tonnes')}</TableHead>
            <TableHead>{t('f.vintage')}</TableHead>
            <TableHead>{t('batch.col.status')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.slice(0, PREVIEW_ROWS).map((item) => (
            <TableRow key={item.row.line}>
              <TableCell className='tabular-nums'>{item.row.line}</TableCell>
              <TableCell>{item.row.draft.projectId}</TableCell>
              <TableCell className='font-mono text-xs'>
                {item.row.draft.serialNumber}
              </TableCell>
              <TableCell>{item.row.draft.methodology}</TableCell>
              <TableCell className='text-right tabular-nums'>
                {item.row.draft.tonnes}
              </TableCell>
              <TableCell className='tabular-nums'>
                {item.row.draft.vintageYear}
              </TableCell>
              <TableCell>
                <RowStatus item={item} status={statusOf(item)} t={t} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
    <p className='text-muted-foreground text-xs'>
      {rows.length > PREVIEW_ROWS
        ? t('batch.moreRows', { count: rows.length - PREVIEW_ROWS })
        : null}
    </p>
  </div>
);
