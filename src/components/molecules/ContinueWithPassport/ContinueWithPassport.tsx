'use client';

import { useId } from 'react';
import { Loader2, LogIn } from 'lucide-react';
import { Button, ButtonVariant } from '@/atoms/Button/Button';
import { Typography } from '@/atoms/Typography/Typography';
import { isPassportAppleEnabled } from '@/config/network';
import { Google } from '@/icons';
import { cn } from '@/libs/utils/utils';
import { PopoverGoogleSignIn } from '@/molecules/PopoverGoogleSignIn/PopoverGoogleSignIn';
import type { ContinueWithPassportProps } from './ContinueWithPassport.types';

/**
 * The one entry point for Pubky Passport: "Continue with Google", or, when the deploy's Passport
 * offers Apple (`isPassportAppleEnabled`), "Continue with Passport" with a neutral sign-in icon and a
 * muted line under the pill naming the accounts Passport accepts. The person picks the provider in
 * Passport, so the app never shows the Apple logo: Apple allows it only inside a Sign in with Apple
 * button. The parent owns the `usePassportAuth` attempt and passes its pending state down so the
 * button can be disabled for the whole attempt, including session initialization.
 *
 * The help mark explaining what Google does here renders centred with the icon and label as one
 * group, yet stays a sibling of the pill, never nested in it, so it remains reachable while an
 * attempt is pending. The pill reserves the mark's slot after its label, and an overlay that
 * mirrors the icon, label and gaps (invisible, hidden from assistive tech, click-through) places
 * the real mark on that slot. The overlay follows the pending label so the two never drift.
 */
export function ContinueWithPassport({ onContinue, isPending, className }: ContinueWithPassportProps) {
  const withApple = isPassportAppleEnabled();
  const hintId = useId();
  const ProviderIcon = withApple ? LogIn : Google;
  const idleLabel = withApple ? 'Continue with Passport' : 'Continue with Google';
  const label = isPending ? 'Waiting for Passport...' : idleLabel;

  const pill = (
    <div className={cn('relative flex', !withApple && className)}>
      <Button
        type="button"
        variant={ButtonVariant.SECONDARY}
        size="lg"
        className="w-full px-8"
        onClick={onContinue}
        disabled={isPending}
        aria-busy={isPending}
        aria-describedby={withApple ? hintId : undefined}
        data-testid="continue-with-google"
      >
        {isPending ? (
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
        ) : (
          <ProviderIcon className="size-4" />
        )}
        <Typography as="span" overrideDefaults aria-live="polite">
          {label}
        </Typography>
        <span className="size-8 shrink-0" aria-hidden="true" data-testid="passport-help-slot" />
      </Button>
      <div
        className="pointer-events-none absolute inset-0 flex items-center justify-center gap-2 px-8 text-sm font-bold whitespace-nowrap"
        data-testid="passport-help-overlay"
      >
        <span className="invisible size-4 shrink-0" aria-hidden="true" />
        <Typography as="span" overrideDefaults className="invisible" aria-hidden="true">
          {label}
        </Typography>
        <PopoverGoogleSignIn className="pointer-events-auto" />
      </div>
    </div>
  );

  if (!withApple) return pill;

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      {pill}
      <Typography
        id={hintId}
        size="xs"
        className="text-center text-muted-foreground"
        data-testid="passport-providers-hint"
      >
        {'Sign in with your Google or Apple account'}
      </Typography>
    </div>
  );
}
