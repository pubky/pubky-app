'use client';

import { Loader2 } from 'lucide-react';
import { Button, ButtonVariant } from '@/atoms/Button/Button';
import { Typography } from '@/atoms/Typography/Typography';
import { Google } from '@/icons';
import { cn } from '@/libs/utils/utils';
import type { ContinueWithPassportProps } from './ContinueWithPassport.types';

/**
 * "Continue with Google" entry point for Pubky Passport.
 *
 * Google is the only provider Passport supports today, so this renders a single button. The
 * parent owns the `usePassportAuth` attempt and passes its pending state down so the button can
 * be disabled for the whole attempt, including session initialization.
 */
export function ContinueWithPassport({ onContinue, isPending, className }: ContinueWithPassportProps) {
  return (
    <Button
      type="button"
      variant={ButtonVariant.SECONDARY}
      size="lg"
      className={cn('w-full', className)}
      onClick={onContinue}
      disabled={isPending}
      aria-busy={isPending}
      data-testid="continue-with-google"
    >
      {isPending ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Google className="size-4" />}
      <Typography as="span" overrideDefaults aria-live="polite">
        {isPending ? 'Waiting for Passport...' : 'Continue with Google'}
      </Typography>
    </Button>
  );
}
