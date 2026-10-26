'use client';

import { Loader2 } from 'lucide-react';
import { Button, ButtonVariant } from '@/atoms/Button/Button';
import { Typography } from '@/atoms/Typography/Typography';
import { Google } from '@/icons';
import { cn } from '@/libs/utils/utils';
import { PopoverGoogleSignIn } from '@/molecules/PopoverGoogleSignIn/PopoverGoogleSignIn';
import type { ContinueWithPassportProps } from './ContinueWithPassport.types';

/**
 * "Continue with Google" entry point for Pubky Passport.
 *
 * Google is the only provider Passport supports today, so this renders a single button. The
 * parent owns the `usePassportAuth` attempt and passes its pending state down so the button can
 * be disabled for the whole attempt, including session initialization.
 *
 * The help mark explaining what Google does here renders centred with the icon and label as one
 * group, yet stays a sibling of the pill, never nested in it, so it remains reachable while an
 * attempt is pending. The pill reserves the mark's slot after its label, and an overlay that
 * mirrors the icon, label and gaps (invisible, hidden from assistive tech, click-through) places
 * the real mark on that slot. The overlay follows the pending label so the two never drift.
 */
export function ContinueWithPassport({ onContinue, isPending, className }: ContinueWithPassportProps) {
  const label = isPending ? 'Waiting for Passport...' : 'Continue with Google';

  return (
    <div className={cn('relative flex', className)}>
      <Button
        type="button"
        variant={ButtonVariant.SECONDARY}
        size="lg"
        className="w-full px-8"
        onClick={onContinue}
        disabled={isPending}
        aria-busy={isPending}
        data-testid="continue-with-google"
      >
        {isPending ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Google className="size-4" />}
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
}
