'use client';

import { useState } from 'react';
import { Minus, Shield, Wallet } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button, ButtonVariant } from '@/atoms/Button/Button';
import { Container } from '@/atoms/Container/Container';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/atoms/Dialog/Dialog';
import { Input } from '@/atoms/Input/Input';
import { Label } from '@/atoms/Label/Label';
import { Tabs, TabsList, TabsTrigger } from '@/atoms/Tabs/Tabs';
import { Typography } from '@/atoms/Typography/Typography';
import { calculatePasswordStrength } from '@/libs/password/password';
import { cn } from '@/libs/utils/utils';
import type { DialogLockContentProps, LockMethod } from './DialogLockContent.types';

const PASSWORD_RULES = ['length', 'number', 'special'] as const;

const PASSWORD_FIELD_CLASS = 'h-14 rounded-md border border-dashed border-input py-4 pr-5 pl-6 text-base shadow-xs';
const FIELD_LABEL_CLASS = 'text-xs font-medium tracking-widest text-muted-foreground uppercase';

export function DialogLockContent({ open, onOpenChange, onApplied }: DialogLockContentProps) {
  const t = useTranslations('dialogs.lockContent');

  const [method, setMethod] = useState<LockMethod>('password');
  const [password, setPassword] = useState('');
  const [repeatPassword, setRepeatPassword] = useState('');

  // Policy: ≥8 chars, ≥1 number, ≥1 special character — reuses the shared strength checks so the
  // special-character definition stays consistent across the app.
  const { checks } = calculatePasswordStrength(password);
  const ruleResults = { length: checks.length, number: checks.numbers, special: checks.symbols };
  const meetsPolicy = ruleResults.length && ruleResults.number && ruleResults.special;
  // Hidden by default; only surface the rules that are still unmet once the user starts typing.
  const unmetRules = password.length > 0 ? PASSWORD_RULES.filter((rule) => !ruleResults[rule]) : [];

  const passwordsMatch = password === repeatPassword;
  const showMismatch = repeatPassword.length > 0 && !passwordsMatch;
  const isPassword = method === 'password';
  const canApply = isPassword && meetsPolicy && passwordsMatch;

  const resetFields = () => {
    setMethod('password');
    setPassword('');
    setRepeatPassword('');
  };

  const handleOpenChange = (next: boolean) => {
    if (!next) resetFields();
    onOpenChange(next);
  };

  // Applying a lock only records the unlock method. Publishing — guarded resources, the content lock
  // and the announcement — belongs to the composer's Post button, so never add a network call here.
  const handleApply = () => {
    if (!canApply) return;
    onApplied(password);
    resetFields();
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className="max-w-md rounded-xl border-x-0 border-y border-brand bg-card sm:max-w-xl"
        hiddenTitle={t('title')}
      >
        <DialogHeader>
          <DialogTitle>{t('title')}</DialogTitle>
        </DialogHeader>

        <Tabs value={method} onValueChange={(value) => setMethod(value as LockMethod)}>
          <TabsList>
            <TabsTrigger value="password" id="lock-tab-password">
              <Shield className="size-5 shrink-0" />
              {t('tabs.password')}
            </TabsTrigger>
            <TabsTrigger value="payment" id="lock-tab-payment">
              <Wallet className="size-5 shrink-0" />
              {t('tabs.payment')}
            </TabsTrigger>
          </TabsList>

          {/*
           * Not Radix TabsContent: it drops the inactive panel from layout (`display:none`), so the
           * modal height jumps between tabs. Here both panels overlap in one grid cell and the password
           * form keeps its space via `invisible` (visibility:hidden), fixing the modal height.
           */}
          <Container
            overrideDefaults
            className="grid"
            role="tabpanel"
            aria-labelledby={isPassword ? 'lock-tab-password' : 'lock-tab-payment'}
          >
            {/* A `form` ancestor keeps browsers from warning that a password field stands alone; the
             * lock is applied from the dialog footer, so submission itself is a no-op. */}
            <form
              onSubmit={(event) => event.preventDefault()}
              aria-hidden={!isPassword}
              className={cn('col-start-1 row-start-1 flex flex-col gap-6', !isPassword && 'invisible')}
            >
              <Typography className="text-base text-secondary-foreground">{t('password.description')}</Typography>

              <Container overrideDefaults className="flex flex-col gap-2">
                <Label htmlFor="lock-password" className={FIELD_LABEL_CLASS}>
                  {t('password.label')}
                </Label>
                <Input
                  id="lock-password"
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  className={PASSWORD_FIELD_CLASS}
                  autoComplete="off"
                  data-1p-ignore
                  data-lpignore="true"
                  tabIndex={isPassword ? undefined : -1}
                />

                {unmetRules.length > 0 && (
                  <Container overrideDefaults className="flex flex-col gap-1.5 pt-1" role="list">
                    {unmetRules.map((rule) => (
                      <Container
                        key={rule}
                        overrideDefaults
                        role="listitem"
                        className="flex flex-row items-center gap-2"
                      >
                        <Minus className="size-3.5 shrink-0 text-muted-foreground" />
                        <Typography className="text-xs text-muted-foreground">{t(`password.rules.${rule}`)}</Typography>
                      </Container>
                    ))}
                  </Container>
                )}
              </Container>

              <Container overrideDefaults className="flex flex-col gap-2">
                <Label htmlFor="lock-repeat-password" className={FIELD_LABEL_CLASS}>
                  {t('password.repeatLabel')}
                </Label>
                <Input
                  id="lock-repeat-password"
                  type="password"
                  value={repeatPassword}
                  onChange={(event) => setRepeatPassword(event.target.value)}
                  className={cn(PASSWORD_FIELD_CLASS, showMismatch && 'border-destructive')}
                  autoComplete="off"
                  data-1p-ignore
                  data-lpignore="true"
                  aria-invalid={showMismatch}
                  tabIndex={isPassword ? undefined : -1}
                />
                {showMismatch && (
                  <Typography size="sm" className="pt-3 text-xs leading-3 font-medium text-destructive">
                    {t('password.mismatch')}
                  </Typography>
                )}
              </Container>
            </form>

            {!isPassword && (
              <Container overrideDefaults className="col-start-1 row-start-1 flex items-center justify-center">
                <Typography className="text-base text-muted-foreground">{t('payment.toBeDeveloped')}</Typography>
              </Container>
            )}
          </Container>
        </Tabs>

        <DialogFooter>
          <Button
            variant={ButtonVariant.OUTLINE}
            size="lg"
            onClick={() => handleOpenChange(false)}
            data-cy="lock-content-cancel"
          >
            {t('cancel')}
          </Button>
          <Button
            variant={ButtonVariant.DEFAULT}
            size="lg"
            onClick={handleApply}
            disabled={!canApply}
            data-cy="lock-content-apply"
          >
            {t('apply')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
