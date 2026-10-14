'use client';

import { Controller, useWatch } from 'react-hook-form';
import { Button, ButtonVariant } from '@/atoms/Button/Button';
import { Container } from '@/atoms/Container/Container';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/atoms/Dialog/Dialog';
import { Input } from '@/atoms/Input/Input';
import { Label } from '@/atoms/Label/Label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/atoms/Select/Select';
import { Typography } from '@/atoms/Typography/Typography';
import { useLockContentForm } from '@/hooks/useLockContentForm/useLockContentForm';
import { LOCK_CONTENT_FORM_FIELDS } from '@/hooks/useLockContentForm/useLockContentForm.types';
import { useBtcRate } from '@/hooks/useSatUsdRate/useSatUsdRate';
import { parseLockPrice } from '@/libs/utils/lockPrice';
import { cn } from '@/libs/utils/utils';
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
  const { form, submit, reset, changeAsset } = useLockContentForm(onApplied);
  const [amount, asset] = useWatch({
    control: form.control,
    name: [LOCK_CONTENT_FORM_FIELDS.AMOUNT, LOCK_CONTENT_FORM_FIELDS.ASSET],
  });
  // The rate is only for pricing a lock, but every post composer mounts this dialog — fetching
  // before it opens would cost a `/api/btc-rate` call on the home feed, Locks users or not.
  const { rate: btcRate, status: rateStatus } = useBtcRate(open && asset === 'BTC');

  const price = parseLockPrice(amount, asset);
  const { isValid, isSubmitting } = form.formState;
  const usdValue = asset === 'BTC' && btcRate && price ? Number(price.amount) * btcRate.satUsd : null;

  const handleOpenChange = (next: boolean) => {
    if (!next) reset();
    onOpenChange(next);
  };

  const handleApply = async () => {
    if (await submit()) reset();
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        avoidKeyboard
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
            <Controller
              name={LOCK_CONTENT_FORM_FIELDS.ASSET}
              control={form.control}
              render={({ field }) => (
                <Select name={field.name} value={field.value} onValueChange={changeAsset}>
                  <SelectTrigger id="lock-currency" ref={field.ref} onBlur={field.onBlur}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="BTC">{'Bitcoin'}</SelectItem>
                    <SelectItem value="USD">{'USD'}</SelectItem>
                  </SelectContent>
                </Select>
              )}
            />
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
              <Controller
                name={LOCK_CONTENT_FORM_FIELDS.AMOUNT}
                control={form.control}
                render={({ field }) => (
                  <Input
                    {...field}
                    id="lock-amount"
                    inputMode={asset === 'BTC' ? 'numeric' : 'decimal'}
                    value={
                      asset === 'BTC' && field.value
                        ? new Intl.NumberFormat('en-US').format(BigInt(field.value))
                        : field.value
                    }
                    onChange={(event) =>
                      field.onChange(asset === 'BTC' ? toSats(event.target.value) : event.target.value)
                    }
                    maxLength={27}
                    placeholder="0"
                    className="h-auto flex-1 border-0 bg-transparent p-0 text-base shadow-none"
                    autoComplete="off"
                  />
                )}
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
            disabled={!isValid || isSubmitting}
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
