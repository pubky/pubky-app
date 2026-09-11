'use client';

import { useState } from 'react';
import { Button, ButtonVariant } from '@/atoms/Button/Button';
import { Container } from '@/atoms/Container/Container';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/atoms/Dialog/Dialog';
import { Input } from '@/atoms/Input/Input';
import { Label } from '@/atoms/Label/Label';
import { Typography } from '@/atoms/Typography/Typography';
import { useBtcRate } from '@/hooks/useSatUsdRate/useSatUsdRate';
import { formatSats } from '@/libs/utils/formatSats';
import { cn, isPositiveIntegerString } from '@/libs/utils/utils';
import type { DialogLockContentProps } from './DialogLockContent.types';

const FIELD_LABEL_CLASS = 'text-xs font-medium tracking-widest text-muted-foreground uppercase';

const usdFormatter = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

// Only the leading run of digits counts. Grouping separators go first so the formatted value the
// field shows survives a round trip; a pasted "1.5" then stops at the dot instead of becoming 15;
// and leading zeros go because the Lock Server wants a bare positive integer ("07" is rejected).
const toSats = (value: string) =>
  value
    .replace(/[,\s]/g, '')
    .replace(/\D.*$/, '')
    .replace(/^0+(?=\d)/, '');

export function DialogLockContent({ open, onOpenChange, onApplied }: DialogLockContentProps) {
  // Bare digits — sats are whole units, and the value travels to the Lock Server as a string.
  const [amount, setAmount] = useState('');
  const { rate: btcRate, status: rateStatus } = useBtcRate();

  const amountSats = Number(amount);
  const isValidAmount = isPositiveIntegerString(amount);
  const usdValue = btcRate && isValidAmount ? amountSats * btcRate.satUsd : null;

  const resetFields = () => setAmount('');

  const handleOpenChange = (next: boolean) => {
    if (!next) resetFields();
    onOpenChange(next);
  };

  // Applying a lock only records the price. Publishing — guarded resources, the content lock
  // and the announcement — belongs to the composer's Post button, so never add a network call here.
  const handleApply = () => {
    if (!isValidAmount) return;
    onApplied({ amountSats: amount });
    resetFields();
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className="max-w-md rounded-xl border-x-0 border-y border-brand bg-card sm:max-w-xl"
        hiddenTitle={'Lock Content'}
      >
        <DialogHeader>
          <DialogTitle>{'Lock Content'}</DialogTitle>
        </DialogHeader>

        <Container overrideDefaults className="flex flex-col gap-6">
          <Typography className="text-base text-secondary-foreground">
            {'Set the price people need to pay to unlock your content.'}
          </Typography>

          <Container overrideDefaults className="flex flex-col gap-2">
            <Label htmlFor="lock-amount" className={FIELD_LABEL_CLASS}>
              {'Bitcoin Amount'}
            </Label>
            <Container
              overrideDefaults
              className={cn(
                'h-14 rounded-md border border-dashed border-input py-4 pr-5 pl-6 text-base shadow-xs',
                'flex items-center gap-3 bg-[rgba(5,5,10,0.1)]',
              )}
            >
              <span aria-hidden className="shrink-0 text-base text-foreground">
                {'₿'}
              </span>
              <Input
                id="lock-amount"
                inputMode="numeric"
                value={amount ? (formatSats(amountSats, { symbol: false }) ?? '') : ''}
                onChange={(event) => setAmount(toSats(event.target.value))}
                placeholder="0"
                className="h-auto flex-1 border-0 bg-transparent p-0 text-base shadow-none"
                autoComplete="off"
              />
              {usdValue !== null && (
                <Typography className="shrink-0 text-sm text-muted-foreground">
                  {usdFormatter.format(usdValue)}
                </Typography>
              )}
            </Container>

            {rateStatus === 'failed' && (
              <Typography className="pt-1 text-xs text-muted-foreground">
                {"The dollar value can't be shown right now. Your price in sats is unaffected."}
              </Typography>
            )}
          </Container>
        </Container>

        <DialogFooter>
          <Button
            variant={ButtonVariant.OUTLINE}
            size="lg"
            onClick={() => handleOpenChange(false)}
            data-cy="lock-content-cancel"
          >
            {'Cancel'}
          </Button>
          <Button
            variant={ButtonVariant.DEFAULT}
            size="lg"
            onClick={handleApply}
            disabled={!isValidAmount}
            data-cy="lock-content-apply"
          >
            {'Apply Lock'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
