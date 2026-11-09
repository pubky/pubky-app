'use client';

import { Loader2 } from 'lucide-react';
import { Button, ButtonVariant } from '@/atoms/Button/Button';
import { Typography } from '@/atoms/Typography/Typography';
import { isPassportAppleEnabled } from '@/config/network';
import { Apple, Google } from '@/icons';
import { cn } from '@/libs/utils/utils';
import { PopoverGoogleSignIn } from '@/molecules/PopoverGoogleSignIn/PopoverGoogleSignIn';
import type { ContinueWithPassportProps } from './ContinueWithPassport.types';

/**
 * Pubky Passport entry point, with a Google label or compact provider icons.
 *
 * The parent owns the `usePassportAuth` attempt and passes its pending state down so the button can
 * be disabled for the whole attempt, including session initialization.
 *
 * The help mark explaining what Google does here renders centred with the icon and label as one
 * group, yet stays a sibling of the pill, never nested in it, so it remains reachable while an
 * attempt is pending. The pill reserves the mark's slot after its label, and an overlay that
 * mirrors the icon, label and gaps (invisible, hidden from assistive tech, click-through) places
 * the real mark on that slot. The overlay follows the pending label so the two never drift.
 */
export function ContinueWithPassport({ onContinue, isPending, className }: ContinueWithPassportProps) {
  const variant = isPassportAppleEnabled() ? 'providers' : 'google';
  const showProviderIcons = variant === 'providers' && !isPending;
  const label = isPending ? 'Waiting for Passport...' : showProviderIcons ? 'Continue with' : 'Continue with Google';

  return (
    <div className={cn('relative flex', className)}>
      <Button
        type="button"
        variant={ButtonVariant.SECONDARY}
        size="lg"
        className="h-15 w-full border-0 px-8 py-0 pr-6 leading-5"
        onClick={onContinue}
        disabled={isPending}
        aria-busy={isPending}
        aria-label={showProviderIcons ? 'Continue with Google or Apple' : undefined}
        data-testid="continue-with-google"
      >
        {!showProviderIcons &&
          (isPending ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Google className="size-4" />)}
        <Typography as="span" overrideDefaults aria-live="polite">
          {label}
        </Typography>
        {showProviderIcons && (
          <>
            <Google className="size-4" />
            <Apple className="size-4 text-foreground" />
          </>
        )}
        <span
          className={cn('size-8 shrink-0', showProviderIcons && '-ml-2')}
          aria-hidden="true"
          data-testid="passport-help-slot"
        />
      </Button>
      <div
        className="pointer-events-none absolute inset-0 flex items-center justify-center gap-2 px-8 pr-6 text-sm font-bold whitespace-nowrap"
        data-testid="passport-help-overlay"
      >
        {!showProviderIcons && <span className="invisible size-4 shrink-0" aria-hidden="true" />}
        <Typography as="span" overrideDefaults className="invisible" aria-hidden="true">
          {label}
        </Typography>
        {showProviderIcons && (
          <>
            <span className="invisible size-4 shrink-0" aria-hidden="true" />
            <span className="invisible size-4 shrink-0" aria-hidden="true" />
          </>
        )}
        <PopoverGoogleSignIn className={cn('pointer-events-auto', showProviderIcons && '-ml-2')} />
      </div>
    </div>
  );
}
