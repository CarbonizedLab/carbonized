'use client';

import { BookOpen } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  EMISSION_FACTORS,
  formatNumber,
  GRID_FACTOR_ID,
} from '@/lib/emissions-tracker';
import { useLocaleStore, useT } from '@/lib/i18n';
import { messages } from '../_messages';

export const FactorTable = ({ gridFactor }: { gridFactor: number }) => {
  const t = useT(messages);
  const locale = useLocaleStore((state) => state.locale);

  return (
    <Card className='rounded-none border-dashed shadow-none'>
      <CardHeader>
        <CardTitle className='flex items-center gap-2'>
          <BookOpen className='size-4 text-primary' />
          {t('factors.title')}
        </CardTitle>
        <p className='text-muted-foreground text-sm'>
          {t('factors.description')}
        </p>
      </CardHeader>
      <CardContent>
        <details className='group'>
          <summary className='cursor-pointer text-primary text-sm underline-offset-4 hover:underline'>
            {t('factors.toggle', { count: EMISSION_FACTORS.length })}
          </summary>
          <div className='mt-3 overflow-x-auto border border-dashed'>
            <table className='w-full text-sm'>
              <thead className='bg-muted/40 text-left text-muted-foreground text-xs'>
                <tr>
                  <th className='px-3 py-2 font-medium' scope='col'>
                    {t('table.scope')}
                  </th>
                  <th className='px-3 py-2 font-medium' scope='col'>
                    {t('table.category')}
                  </th>
                  <th className='px-3 py-2 text-right font-medium' scope='col'>
                    {t('factors.colFactor')}
                  </th>
                  <th className='px-3 py-2 font-medium' scope='col'>
                    {t('factors.colSource')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {EMISSION_FACTORS.map((factor) => (
                  <tr className='border-t border-dashed' key={factor.id}>
                    <td className='whitespace-nowrap px-3 py-2'>
                      {t(`scope.${factor.scope}.short`)}
                    </td>
                    <td className='px-3 py-2'>{t(`factor.${factor.id}`)}</td>
                    <td className='whitespace-nowrap px-3 py-2 text-right tabular-nums'>
                      {formatNumber(
                        factor.id === GRID_FACTOR_ID
                          ? gridFactor
                          : factor.factor,
                        locale,
                        4
                      )}{' '}
                      <span className='text-muted-foreground text-xs'>
                        {t('unit.kgPerUnit', {
                          unit: t(`unit.${factor.unit}`),
                        })}
                      </span>
                    </td>
                    <td className='px-3 py-2 text-muted-foreground text-xs'>
                      {factor.source}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className='mt-2 text-muted-foreground text-xs'>
            {t('factors.disclaimer')}
          </p>
        </details>
      </CardContent>
    </Card>
  );
};
