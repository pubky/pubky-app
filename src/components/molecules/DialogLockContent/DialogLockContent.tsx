'use client';

import { useState } from 'react';
import { Button, ButtonVariant } from '@/atoms/Button/Button';
import { Container } from '@/atoms/Container/Container';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/atoms/Dialog/Dialog';
import { Input } from '@/atoms/Input/Input';
import { Label } from '@/atoms/Label/Label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/atoms/Select/Select';
import { Typography } from '@/atoms/Typography/Typography';
import { useBtcRate } from '@/hooks/useSatUsdRate/useSatUsdRate';
import { parseLockPrice } from '@/libs/utils/lockPrice';
import { cn } from '@/libs/utils/utils';
import type { TLockPriceAsset } from '@/services/locks/locks.types';
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
  const [amount, setAmount] = useState('');
  const [asset, setAsset] = useState<TLockPriceAsset>('BTC');
  // The rate is only for pricing a lock, but every post composer mounts this dialog — fetching
  // before it opens would cost a `/api/btc-rate` call on the home feed, Locks users or not.
  const { rate: btcRate, status: rateStatus } = useBtcRate(open && asset === 'BTC');

  const price = parseLockPrice(amount, asset);
  const isValidAmount = price !== null;
  const usdValue = asset === 'BTC' && btcRate && price ? Number(price.amount) * btcRate.satUsd : null;

  const resetFields = () => {
    setAmount('');
    setAsset('BTC');
  };

  const changeAsset = (value: string) => {
    if (value !== 'BTC' && value !== 'USD') return;
    setAsset(value);
    setAmount('');
  };

  const handleOpenChange = (next: boolean) => {
    if (!next) resetFields();
    onOpenChange(next);
  };

  // Applying a lock only records the price. Publishing — guarded resources, the content lock
  // and the announcement — belongs to the composer's Post button, so never add a network call here.
  const handleApply = () => {
    if (!price) return;
    onApplied(price);
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
            <Label htmlFor="lock-currency" className={FIELD_LABEL_CLASS}>
              {'Price currency'}
            </Label>
            <Select value={asset} onValueChange={changeAsset}>
              <SelectTrigger id="lock-currency">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="BTC">{'Bitcoin'}</SelectItem>
                <SelectItem value="USD">{'USD'}</SelectItem>
              </SelectContent>
            </Select>
          </Container>

          <Container overrideDefaults className="flex flex-col gap-2">
            <Label htmlFor="lock-amount" className={FIELD_LABEL_CLASS}>
              {asset === 'BTC' ? 'Bitcoin Amount' : `${asset} Amount`}
            </Label>
            <Container
              overrideDefaults
              className={cn(
                'h-14 rounded-md border border-dashed border-input py-4 pr-5 pl-6 text-base shadow-xs',
                'flex items-center gap-3 bg-background/20',
              )}
            >
              <span aria-hidden className="shrink-0 text-base text-foreground">
                {asset === 'BTC' ? '₿' : '$'}
              </span>
              <Input
                id="lock-amount"
                inputMode={asset === 'BTC' ? 'numeric' : 'decimal'}
                value={asset === 'BTC' && amount ? new Intl.NumberFormat('en-US').format(BigInt(amount)) : amount}
                onChange={(event) => setAmount(asset === 'BTC' ? toSats(event.target.value) : event.target.value)}
                maxLength={27}
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

            {asset === 'BTC' && rateStatus === 'failed' && (
              <Typography className="pt-1 text-xs text-destructive">
                {"The dollar value can't be shown right now. Your Bitcoin price is unaffected."}
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
            // The Button base sets disabled:pointer-events-none, which would swallow the hover and
            // leave the default arrow cursor. A disabled button still cannot fire a click.
            className="disabled:pointer-events-auto disabled:cursor-not-allowed"
            data-cy="lock-content-apply"
          >
            {'Apply Lock'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
