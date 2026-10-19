'use client';

import { Plus } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  EMISSION_FACTORS,
  formatMonth,
  formatNumber,
  GRID_FACTOR_ID,
  getFactor,
  SCOPES,
} from '@/lib/emissions-tracker';
import { useLocaleStore, useT } from '@/lib/i18n';
import { messages } from '../_messages';

export interface ActivityInput {
  month: number;
  factorId: string;
  quantity: number;
  note: string;
}

interface ActivityFormProps {
  gridFactor: number;
  defaultMonth: number;
  onAdd: (input: ActivityInput) => void;
}

const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1);
const MAX_QUANTITY = 1e12;
const NOTE_MAX_LENGTH = 120;
const KG_PER_TONNE = 1000;
const DEFAULT_FACTOR_ID = 'diesel_genset';

export const ActivityForm = ({
  gridFactor,
  defaultMonth,
  onAdd,
}: ActivityFormProps) => {
  const t = useT(messages);
  const locale = useLocaleStore((state) => state.locale);
  const [month, setMonth] = useState(String(defaultMonth));
  const [factorId, setFactorId] = useState(DEFAULT_FACTOR_ID);
  const [quantity, setQuantity] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);

  const definition = getFactor(factorId);
  const activeFactor =
    factorId === GRID_FACTOR_ID ? gridFactor : (definition?.factor ?? 0);
  const parsedQuantity = Number(quantity);
  const hasQuantity = quantity.trim() !== '' && Number.isFinite(parsedQuantity);
  const previewKg = hasQuantity ? parsedQuantity * activeFactor : 0;

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!hasQuantity || parsedQuantity <= 0) {
      setError(t('form.errorQuantity'));
      return;
    }
    if (parsedQuantity > MAX_QUANTITY) {
      setError(t('form.errorTooLarge'));
      return;
    }
    setError(null);
    onAdd({
      month: Number(month),
      factorId,
      quantity: parsedQuantity,
      note: note.trim().slice(0, NOTE_MAX_LENGTH),
    });
    setQuantity('');
    setNote('');
  };

  return (
    <Card className='rounded-none border-dashed shadow-none'>
      <CardHeader>
        <CardTitle>{t('form.title')}</CardTitle>
        <p className='text-muted-foreground text-sm'>{t('form.description')}</p>
      </CardHeader>
      <CardContent>
        <form className='space-y-4' noValidate onSubmit={handleSubmit}>
          <div className='grid gap-4 sm:grid-cols-2'>
            <div className='space-y-2'>
              <Label htmlFor='activity-month'>{t('form.month')}</Label>
              <Select onValueChange={setMonth} value={month}>
                <SelectTrigger className='w-full' id='activity-month'>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MONTHS.map((value) => (
                    <SelectItem key={value} value={String(value)}>
                      {formatMonth(value, locale, 'long')}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className='space-y-2'>
              <Label htmlFor='activity-category'>{t('form.category')}</Label>
              <Select onValueChange={setFactorId} value={factorId}>
                <SelectTrigger className='w-full' id='activity-category'>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SCOPES.map((scope) => (
                    <SelectGroup key={scope}>
                      <SelectLabel>{t(`scope.${scope}`)}</SelectLabel>
                      {EMISSION_FACTORS.filter(
                        (factor) => factor.scope === scope
                      ).map((factor) => (
                        <SelectItem key={factor.id} value={factor.id}>
                          {t(`factor.${factor.id}`)}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className='space-y-2'>
            <Label htmlFor='activity-quantity'>{t('form.quantity')}</Label>
            <div className='flex items-center gap-2'>
              <Input
                aria-describedby={error ? 'activity-error' : undefined}
                aria-invalid={error ? true : undefined}
                id='activity-quantity'
                inputMode='decimal'
                min='0'
                onChange={(event) => setQuantity(event.target.value)}
                placeholder='0'
                step='any'
                type='number'
                value={quantity}
              />
              <span className='min-w-16 border border-dashed px-3 py-2 text-center text-muted-foreground text-sm'>
                {definition ? t(`unit.${definition.unit}`) : ''}
              </span>
            </div>
            {error ? (
              <p
                className='text-destructive text-xs'
                id='activity-error'
                role='alert'
              >
                {error}
              </p>
            ) : null}
          </div>

          <div className='space-y-2'>
            <Label htmlFor='activity-note'>{t('form.note')}</Label>
            <Input
              id='activity-note'
              maxLength={NOTE_MAX_LENGTH}
              onChange={(event) => setNote(event.target.value)}
              placeholder={t('form.notePlaceholder')}
              value={note}
            />
          </div>

          <dl className='grid grid-cols-2 gap-px border border-dashed bg-border text-sm'>
            <div className='bg-card p-3'>
              <dt className='text-muted-foreground text-xs'>
                {t('form.factor')}
              </dt>
              <dd className='font-medium'>
                {formatNumber(activeFactor, locale, 4)}{' '}
                <span className='font-normal text-muted-foreground text-xs'>
                  {t('unit.kgPerUnit', {
                    unit: definition ? t(`unit.${definition.unit}`) : '',
                  })}
                </span>
              </dd>
            </div>
            <div className='bg-card p-3'>
              <dt className='text-muted-foreground text-xs'>
                {t('form.result')}
              </dt>
              <dd aria-live='polite' className='font-semibold text-primary'>
                {formatNumber(previewKg / KG_PER_TONNE, locale, 4)}{' '}
                {t('unit.tco2e')}
              </dd>
            </div>
          </dl>
          {definition ? (
            <p className='text-muted-foreground text-xs'>
              {t('form.source', { source: definition.source })}
            </p>
          ) : null}

          <Button className='w-full' type='submit'>
            <Plus />
            {t('form.add')}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
};
