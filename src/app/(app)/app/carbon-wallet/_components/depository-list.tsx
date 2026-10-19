'use client';

import { Wallet } from 'lucide-react';
import { Fragment, useState } from 'react';
import { toast } from 'sonner';
import { EmptyState } from '@/components/app/empty-state';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { type DepositoryCredit, retireDepositoryCredit } from '@/lib/carb-api';
import { formatCarbonTonnes } from '@/lib/carb-format';
import { useLocaleStore, useT } from '@/lib/i18n';
import { messages } from '../_messages';

const COLUMN_COUNT = 8;

interface DepositoryListProps {
  address: string;
  credits: DepositoryCredit[];
  onRetired: () => void;
}

export const DepositoryList = ({
  address,
  credits,
  onRetired,
}: DepositoryListProps) => {
  const t = useT(messages);
  const locale = useLocaleStore((s) => s.locale);
  const dateFormatter = new Intl.DateTimeFormat(
    locale === 'zh' ? 'zh-CN' : 'en-US',
    { year: 'numeric', month: 'short', day: 'numeric' }
  );
  const [retireCreditId, setRetireCreditId] = useState<string | null>(null);
  const [retireReason, setRetireReason] = useState('');
  const [retiring, setRetiring] = useState(false);

  const handleRetire = async () => {
    if (!retireCreditId) {
      return;
    }
    setRetiring(true);
    try {
      await retireDepositoryCredit(retireCreditId, address, retireReason);
      toast.success(t('depository.retiredToast'));
      setRetireCreditId(null);
      setRetireReason('');
      onRetired();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : t('depository.retireFailed')
      );
    } finally {
      setRetiring(false);
    }
  };

  const cancelRetire = () => {
    setRetireCreditId(null);
    setRetireReason('');
  };

  if (credits.length === 0) {
    return (
      <EmptyState
        description={t('depository.emptyDescription')}
        icon={<Wallet className='size-12' />}
        title={t('depository.emptyTitle')}
      />
    );
  }

  return (
    <Card className='rounded-none border-dashed p-0 shadow-none'>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t('depository.creditId')}</TableHead>
            <TableHead>{t('depository.project')}</TableHead>
            <TableHead>{t('depository.tonnes')}</TableHead>
            <TableHead>{t('depository.methodology')}</TableHead>
            <TableHead>{t('depository.vintage')}</TableHead>
            <TableHead>{t('depository.status')}</TableHead>
            <TableHead>{t('depository.issued')}</TableHead>
            <TableHead>{t('depository.actions')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {credits.map((c) => (
            <Fragment key={c.creditId}>
              <TableRow>
                <TableCell className='font-mono text-sm'>
                  {c.creditId}
                </TableCell>
                <TableCell>{c.projectId}</TableCell>
                <TableCell className='font-medium'>
                  {formatCarbonTonnes(c.co2Amount)}
                </TableCell>
                <TableCell className='text-muted-foreground text-sm'>
                  {c.methodology}
                </TableCell>
                <TableCell>{c.vintageYear}</TableCell>
                <TableCell>
                  <Badge
                    className={
                      c.status === 'Active'
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : 'text-muted-foreground'
                    }
                    variant='outline'
                  >
                    {c.status === 'Active'
                      ? t('depository.statusActive')
                      : t('depository.statusRetired')}
                  </Badge>
                </TableCell>
                <TableCell className='text-muted-foreground text-sm'>
                  {dateFormatter.format(new Date(c.issuedAt))}
                </TableCell>
                <TableCell>
                  {c.status === 'Active' && (
                    <Button
                      onClick={() =>
                        setRetireCreditId(
                          retireCreditId === c.creditId ? null : c.creditId
                        )
                      }
                      size='sm'
                      type='button'
                      variant='outline'
                    >
                      {t('depository.retire')}
                    </Button>
                  )}
                  {c.status === 'Retired' && c.retirementReason && (
                    <span
                      className='text-muted-foreground text-xs'
                      title={c.retirementReason}
                    >
                      {t('depository.statusRetired')}
                    </span>
                  )}
                </TableCell>
              </TableRow>
              {retireCreditId === c.creditId && c.status === 'Active' && (
                <TableRow className='bg-muted/40'>
                  <TableCell colSpan={COLUMN_COUNT}>
                    <div className='flex flex-col items-start gap-3 sm:flex-row sm:items-end'>
                      <div className='w-full flex-1 space-y-2 sm:max-w-md'>
                        <Label htmlFor={`retire-reason-${c.creditId}`}>
                          {t('depository.reasonLabel')}
                        </Label>
                        <Input
                          id={`retire-reason-${c.creditId}`}
                          onChange={(e) => setRetireReason(e.target.value)}
                          placeholder={t('depository.reasonPlaceholder')}
                          value={retireReason}
                        />
                      </div>
                      <div className='flex gap-2'>
                        <Button
                          disabled={retiring}
                          onClick={handleRetire}
                          type='button'
                        >
                          {retiring
                            ? t('depository.retiring')
                            : t('depository.confirmRetire')}
                        </Button>
                        <Button
                          disabled={retiring}
                          onClick={cancelRetire}
                          type='button'
                          variant='ghost'
                        >
                          {t('depository.cancel')}
                        </Button>
                      </div>
                    </div>
                    <p className='mt-2 text-muted-foreground text-xs'>
                      {t('depository.permanent')}
                    </p>
                  </TableCell>
                </TableRow>
              )}
            </Fragment>
          ))}
        </TableBody>
      </Table>
    </Card>
  );
};
