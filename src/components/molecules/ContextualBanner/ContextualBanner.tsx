'use client';

import Link from 'next/link';
import { Loader2 } from 'lucide-react';
import { Button } from '@/atoms/Button/Button';
import { Typography } from '@/atoms/Typography/Typography';
import { CONTENT_GUTTER_CLASS } from '@/config/layoutClasses';
import { Google } from '@/icons';
import { cn } from '@/libs/utils/utils';
import type { ContextualBannerProps } from './ContextualBanner.types';

/** The Button atom's grey focus ring is too faint on lime; a dark ring keeps focus visible. */
const FOCUS_RING_CLASS = 'focus-visible:ring-primary-foreground';
/** Dark outline pill on the lime bar, as in `AlertInstall`. */
const OUTLINE_BUTTON_CLASS = cn('flex-1 bg-input/30 font-bold text-primary-foreground lg:flex-none', FOCUS_RING_CLASS);

/**
 * ContextualBanner
 *
 * Lime "Join Pubky" bar fixed to the bottom of the viewport (Figma: `Pubky / Contextual banner`).
 * Desktop: one row, full bleed, flush with the viewport, under a fading scrim. Below `lg` it sits
 * on top of the mobile footer as a stacked card (a single row on landscape phones, where height is
 * scarce), and "Continue with Google" is icon-only below `sm`. Only the bar takes pointer input:
 * the scrim is decoration and must not block the page under it.
 * Presentational only: `GuestContextualBanner` decides when it shows and what it says.
 */
export function ContextualBanner({
  headline,
  body,
  joinHref,
  signInHref,
  onContinueWithGoogle,
  isGooglePending = false,
  className,
}: ContextualBannerProps) {
  const googleLabel = isGooglePending ? 'Waiting for Passport...' : 'Continue with Google';

  return (
    <section
      aria-label="Join Pubky"
      data-slot="contextual-banner"
      data-testid="contextual-banner"
      className={cn('pointer-events-none fixed inset-x-0 bottom-18 z-40 sm:bottom-20 lg:bottom-0', className)}
    >
      <div
        aria-hidden="true"
        className="hidden h-28 animate-in bg-gradient-to-b from-transparent to-background duration-300 fade-in motion-reduce:animate-none lg:block"
      />
      <div
        data-testid="contextual-banner-bar"
        className="pointer-events-auto animate-in bg-brand text-primary-foreground duration-300 ease-out fade-in slide-in-from-bottom motion-reduce:animate-none"
      >
        <div
          className={cn(
            'container m-auto flex w-full max-w-(--container-max-width) flex-col gap-3 py-4 lg:flex-row lg:items-center lg:py-6 max-lg:landscape:flex-row max-lg:landscape:items-center',
            CONTENT_GUTTER_CLASS,
          )}
        >
          <div className="flex min-w-0 flex-1 flex-col">
            {/* leading-5 rather than leading-none: `truncate` clips descenders on a 16px line box. */}
            <Typography overrideDefaults className="truncate text-base leading-5 font-bold">
              {headline}
            </Typography>
            <Typography overrideDefaults className="line-clamp-2 text-sm font-medium max-lg:landscape:line-clamp-1">
              {body}
            </Typography>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <Button asChild variant="dark-outline" className={OUTLINE_BUTTON_CLASS}>
              <Link href={joinHref}>{'Join Pubky'}</Link>
            </Button>
            <Button asChild variant="dark-outline" className={OUTLINE_BUTTON_CLASS}>
              <Link href={signInHref}>{'Sign in'}</Link>
            </Button>
            {onContinueWithGoogle && (
              <>
                <span aria-hidden="true" className="mx-1.5 h-6 w-px shrink-0 bg-border" />
                <Button
                  type="button"
                  variant="dark"
                  // Icon-only square below `sm`; the size variant's `has-[>svg]` padding must be reset too.
                  className={cn(
                    'size-10 px-0 font-bold has-[>svg]:px-0 sm:w-auto sm:px-4 sm:has-[>svg]:px-4',
                    FOCUS_RING_CLASS,
                  )}
                  onClick={onContinueWithGoogle}
                  disabled={isGooglePending}
                  aria-busy={isGooglePending}
                  aria-label={googleLabel}
                  data-testid="contextual-banner-google"
                >
                  {isGooglePending ? (
                    <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                  ) : (
                    <Google className="size-4" aria-hidden="true" />
                  )}
                  <span className="hidden sm:inline">{googleLabel}</span>
                </Button>
              </>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
