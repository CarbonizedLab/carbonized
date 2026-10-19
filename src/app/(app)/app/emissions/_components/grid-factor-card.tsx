'use client';

import { RotateCcw, Save, Zap } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  DEFAULT_GRID_FACTOR,
  formatNumber,
  GRID_FACTOR_SOURCE,
} from '@/lib/emissions-tracker';
import { useLocaleStore, useT } from '@/lib/i18n';
import { messages } from '../_messages';

interface GridFactorCardProps {
  gridFactor: number;
  /** Electricity records whose stored factor differs from `gridFactor`. */
  staleRecords: number;
  onSave: (value: number) => void;
  onRecalculate: () => void;
}

const MAX_GRID_FACTOR = 5;

export const GridFactorCard = ({
  gridFactor,
  staleRecords,
  onSave,
  onRecalculate,
}: GridFactorCardProps) => {
  const t = useT(messages);
  const locale = useLocaleStore((state) => state.locale);
  const [draft, setDraft] = useState(String(gridFactor));

  const parsed = Number(draft);
  const isValid =
    draft.trim() !== '' &&
    Number.isFinite(parsed) &&
    parsed > 0 &&
    parsed <= MAX_GRID_FACTOR;
  const isDirty = isValid && parsed !== gridFactor;

  const reset = () => {
    setDraft(String(DEFAULT_GRID_FACTOR));
    onSave(DEFAULT_GRID_FACTOR);
  };

  return (
    <Card className='rounded-none border-dashed shadow-none'>
      <CardHeader>
        <CardTitle className='flex items-center gap-2'>
          <Zap className='size-4 text-blue-500' />
          {t('grid.title')}
        </CardTitle>
        <p className='text-muted-foreground text-sm'>{t('grid.description')}</p>
      </CardHeader>
      <CardContent className='space-y-4'>
        <div className='space-y-2'>
          <Label htmlFor='grid-factor'>{t('grid.label')}</Label>
          <div className='flex flex-wrap gap-2'>
            <Input
              aria-describedby='grid-factor-help'
              aria-invalid={isValid ? undefined : true}
              className='w-40'
              id='grid-factor'
              inputMode='decimal'
              min='0'
              onChange={(event) => setDraft(event.target.value)}
              step='0.001'
              type='number'
              value={draft}
            />
            <Button
              disabled={!isDirty}
              onClick={() => onSave(parsed)}
              type='button'
            >
              <Save />
              {t('grid.save')}
            </Button>
            <Button
              disabled={gridFactor === DEFAULT_GRID_FACTOR}
              onClick={reset}
              type='button'
              variant='outline'
            >
              <RotateCcw />
              {t('grid.reset')}
            </Button>
          </div>
          <p
            className={
              isValid
                ? 'text-muted-foreground text-xs'
                : 'text-destructive text-xs'
            }
            id='grid-factor-help'
          >
            {isValid
              ? t('grid.help', { default: DEFAULT_GRID_FACTOR })
              : t('grid.invalid', { max: MAX_GRID_FACTOR })}
          </p>
        </div>

        <div className='border border-dashed p-3 text-xs'>
          <p className='font-medium'>{t('grid.assumptionTitle')}</p>
          <p className='mt-1 text-muted-foreground'>
            {t('grid.assumption', {
              factor: formatNumber(gridFactor, locale, 4),
              source: GRID_FACTOR_SOURCE,
            })}
          </p>
        </div>

        {staleRecords > 0 ? (
          <div className='flex flex-wrap items-center justify-between gap-2 border border-amber-500/40 border-dashed bg-amber-500/10 p-3 text-xs'>
            <p className='text-amber-700 dark:text-amber-300'>
              {t('grid.stale', { count: staleRecords })}
            </p>
            <Button
              onClick={onRecalculate}
              size='sm'
              type='button'
              variant='outline'
            >
              {t('grid.recalculate')}
            </Button>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
};
