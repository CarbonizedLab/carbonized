'use client';

import { BadgeCheck, ShieldCheck } from 'lucide-react';
import { type ReactNode, useId } from 'react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useT } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import {
  getCompletedItems,
  getFieldErrors,
  ISO_ITEMS,
  type IsoItemId,
  type IsoState,
} from '../_lib/iso-state';
import { messages } from '../_messages';

interface IsoChecklistProps {
  state: IsoState;
  maxYear: number;
  hasTrackerData: boolean;
  onChange: (next: IsoState) => void;
}

const PERCENT = 100;

const FieldError = ({ id, message }: { id: string; message: string }) => (
  <p className='text-destructive text-xs' id={id} role='alert'>
    {message}
  </p>
);

const CheckboxRow = ({
  id,
  checked,
  auto,
  onToggle,
  children,
}: {
  id: IsoItemId;
  checked: boolean;
  auto: boolean;
  onToggle: (checked: boolean) => void;
  children?: ReactNode;
}) => {
  const t = useT(messages);
  const inputId = useId();
  return (
    <li
      className={cn(
        'space-y-3 border border-dashed p-3 transition-colors',
        checked && 'border-emerald-500/50 bg-emerald-500/5'
      )}
    >
      <div className='flex items-start gap-3'>
        <input
          checked={checked}
          className='mt-1 size-4 shrink-0 accent-primary'
          disabled={auto}
          id={inputId}
          onChange={(event) => onToggle(event.target.checked)}
          type='checkbox'
        />
        <div className='min-w-0 flex-1'>
          <Label
            className='flex flex-wrap items-center gap-2'
            htmlFor={inputId}
          >
            {t(`iso.${id}.title`)}
            {auto ? (
              <Badge
                className='border-primary/40 text-primary'
                variant='outline'
              >
                {t('iso.auto')}
              </Badge>
            ) : null}
          </Label>
          <p className='mt-1 text-muted-foreground text-xs'>
            {t(`iso.${id}.hint`)}
          </p>
        </div>
      </div>
      {children}
    </li>
  );
};

export const IsoChecklist = ({
  state,
  maxYear,
  hasTrackerData,
  onChange,
}: IsoChecklistProps) => {
  const t = useT(messages);
  const errors = getFieldErrors(state, maxYear);
  const completed = getCompletedItems(state, maxYear, hasTrackerData);
  const progress = Math.round((completed.length / ISO_ITEMS.length) * PERCENT);
  const ready = completed.length === ISO_ITEMS.length;

  const toggle = (id: IsoItemId, checked: boolean) =>
    onChange({ ...state, checks: { ...state.checks, [id]: checked } });
  const setField = (
    field: 'baseYear' | 'auditor' | 'verifiedOn' | 'docHash',
    value: string
  ) => onChange({ ...state, [field]: value });

  return (
    <Card className='rounded-none border-dashed shadow-none'>
      <CardHeader className='gap-3'>
        <div className='flex flex-wrap items-center justify-between gap-2'>
          <CardTitle className='flex items-center gap-2'>
            <ShieldCheck className='size-4 text-primary' />
            {t('iso.title')}
          </CardTitle>
          <Badge
            className={cn(
              ready
                ? 'border-transparent bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                : ''
            )}
            variant='outline'
          >
            {ready ? <BadgeCheck /> : null}
            {ready ? t('iso.ready') : t('iso.inProgress')}
          </Badge>
        </div>
        <p className='text-muted-foreground text-sm'>{t('iso.description')}</p>
        <div className='space-y-1'>
          <div className='flex justify-between text-xs'>
            <span className='text-muted-foreground'>
              {t('iso.progress', {
                done: completed.length,
                total: ISO_ITEMS.length,
              })}
            </span>
            <span className='font-medium'>{progress}%</span>
          </div>
          <div
            aria-label={t('iso.progressLabel')}
            aria-valuemax={PERCENT}
            aria-valuemin={0}
            aria-valuenow={progress}
            className='h-2 w-full overflow-hidden bg-muted'
            role='progressbar'
          >
            <div
              className='h-full bg-primary transition-all'
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <ul className='space-y-3'>
          <CheckboxRow
            auto={false}
            checked={state.checks.boundary}
            id='boundary'
            onToggle={(checked) => toggle('boundary', checked)}
          />
          <CheckboxRow
            auto={false}
            checked={state.checks.baseYear}
            id='baseYear'
            onToggle={(checked) => toggle('baseYear', checked)}
          >
            <div className='space-y-1 pl-7'>
              <Label className='text-xs' htmlFor='iso-base-year'>
                {t('iso.baseYear.field')}
              </Label>
              <Input
                aria-describedby={
                  errors.baseYear ? 'iso-base-year-error' : undefined
                }
                aria-invalid={errors.baseYear ? true : undefined}
                className='w-32'
                id='iso-base-year'
                inputMode='numeric'
                maxLength={4}
                onChange={(event) => setField('baseYear', event.target.value)}
                placeholder={String(maxYear)}
                value={state.baseYear}
              />
              {errors.baseYear ? (
                <FieldError
                  id='iso-base-year-error'
                  message={t('iso.baseYear.error', { max: maxYear })}
                />
              ) : null}
            </div>
          </CheckboxRow>
          <CheckboxRow
            auto={hasTrackerData}
            checked={hasTrackerData || state.checks.sources}
            id='sources'
            onToggle={(checked) => toggle('sources', checked)}
          />
          <CheckboxRow
            auto={false}
            checked={state.checks.dataQuality}
            id='dataQuality'
            onToggle={(checked) => toggle('dataQuality', checked)}
          />
          <CheckboxRow
            auto={false}
            checked={state.checks.report}
            id='report'
            onToggle={(checked) => toggle('report', checked)}
          />
          <CheckboxRow
            auto={false}
            checked={state.checks.verification}
            id='verification'
            onToggle={(checked) => toggle('verification', checked)}
          >
            <div className='grid gap-3 pl-7 sm:grid-cols-2'>
              <div className='space-y-1'>
                <Label className='text-xs' htmlFor='iso-auditor'>
                  {t('iso.verification.auditor')}
                </Label>
                <Input
                  aria-describedby={
                    errors.auditor ? 'iso-auditor-error' : undefined
                  }
                  aria-invalid={errors.auditor ? true : undefined}
                  id='iso-auditor'
                  onChange={(event) => setField('auditor', event.target.value)}
                  placeholder={t('iso.verification.auditorPlaceholder')}
                  value={state.auditor}
                />
                {errors.auditor ? (
                  <FieldError
                    id='iso-auditor-error'
                    message={t('iso.verification.auditorError')}
                  />
                ) : null}
              </div>
              <div className='space-y-1'>
                <Label className='text-xs' htmlFor='iso-verified-on'>
                  {t('iso.verification.date')}
                </Label>
                <Input
                  aria-describedby={
                    errors.verifiedOn ? 'iso-date-error' : undefined
                  }
                  aria-invalid={errors.verifiedOn ? true : undefined}
                  id='iso-verified-on'
                  onChange={(event) =>
                    setField('verifiedOn', event.target.value)
                  }
                  type='date'
                  value={state.verifiedOn}
                />
                {errors.verifiedOn ? (
                  <FieldError
                    id='iso-date-error'
                    message={t('iso.verification.dateError')}
                  />
                ) : null}
              </div>
              <div className='space-y-1 sm:col-span-2'>
                <Label className='text-xs' htmlFor='iso-doc-hash'>
                  {t('iso.verification.hash')}
                </Label>
                <Input
                  aria-describedby={
                    errors.docHash ? 'iso-hash-error' : undefined
                  }
                  aria-invalid={errors.docHash ? true : undefined}
                  className='font-mono text-xs'
                  id='iso-doc-hash'
                  onChange={(event) => setField('docHash', event.target.value)}
                  placeholder='0x… / Qm… / bafy…'
                  spellCheck={false}
                  value={state.docHash}
                />
                {errors.docHash ? (
                  <FieldError
                    id='iso-hash-error'
                    message={t('iso.verification.hashError')}
                  />
                ) : null}
              </div>
            </div>
          </CheckboxRow>
        </ul>
        <p className='mt-4 text-muted-foreground text-xs'>{t('iso.storage')}</p>
      </CardContent>
    </Card>
  );
};
