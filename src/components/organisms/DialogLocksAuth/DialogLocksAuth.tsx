'use client';

/**
 * DialogLocksAuth
 *
 * Three-step modal that authenticates a creator to the Lock Server (Intro → Enable → Enabled):
 *  1. Intro   — explains Locks; "Continue" begins the flow.
 *  2. Enable  — iframe loads the Lock Server `/connect` page. On approval it posts the code
 *               to the parent and `useLocksAuthFlow` exchanges it.
 *  3. Enabled — success; "Continue" hands the session to the caller via `onSuccess`.
 *
 * Steps 1 and 3 are rendered by the parent; only step 2 is the Lock Server iframe.
 */
import { type ReactNode, useEffect } from 'react';
import type { Session as LocksSdkSession } from '@pubky/locks-sdk';
import { LoaderCircle } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button, ButtonVariant } from '@/atoms/Button/Button';
import { Container } from '@/atoms/Container/Container';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/atoms/Dialog/Dialog';
import { Image } from '@/atoms/Image/Image';
import { Typography } from '@/atoms/Typography/Typography';
import { useLocksAuthFlow } from '@/hooks/useLocksAuthFlow/useLocksAuthFlow';
import { LocksAuthFlowStatus } from '@/hooks/useLocksAuthFlow/useLocksAuthFlow.types';
import { cn } from '@/libs/utils/utils';

type DialogLocksAuthProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: (session: LocksSdkSession) => void;
};

// Card chrome: card bg, brand-green top+bottom borders, rounded-xl.
// `overrideDefaults` drops the atom's default background/border so these win cleanly.
const CARD_CLASSNAME =
  'flex max-h-[calc(100dvh-2rem)] w-full max-w-[100vw] flex-col gap-6 overflow-y-auto rounded-xl border-y border-brand bg-card p-8 shadow-2xl outline-none sm:max-w-xl';

// Frames the 192px step illustration.
function StepImage({ src, alt }: { src: string; alt: string }) {
  return (
    <Container className="flex items-center justify-center px-12 py-6">
      <Image src={src} alt={alt} width={192} height={192} className="size-48" />
    </Container>
  );
}

export function DialogLocksAuth({ open, onOpenChange, onSuccess }: DialogLocksAuthProps) {
  const { status, connectUrl, session, error, iframeRef, prepare, start, reset } = useLocksAuthFlow();
  const t = useTranslations('dialogs.locksAuth');
  const tCommon = useTranslations('common');

  // Probe the Lock Server's readiness when the modal opens; reset when it closes. "Continue" only
  // starts the auth flow once the probe says the server is ready.
  useEffect(() => {
    if (open) prepare();
    else reset();
  }, [open, prepare, reset]);

  const close = () => onOpenChange(false);
  const isSuccess = status === LocksAuthFlowStatus.SUCCESS;
  const isError = status === LocksAuthFlowStatus.ERROR;
  const isCheckingServer = status === LocksAuthFlowStatus.CHECKING_SERVER;
  const isServerUnavailable = status === LocksAuthFlowStatus.SERVER_UNAVAILABLE;
  // Intro step: the readiness probe (checking / ready / unavailable), before the auth iframe.
  const isIntroPhase = isCheckingServer || isServerUnavailable || status === LocksAuthFlowStatus.IDLE;
  const isEnableStep =
    status === LocksAuthFlowStatus.CONNECTING ||
    status === LocksAuthFlowStatus.AWAITING_APPROVAL ||
    status === LocksAuthFlowStatus.EXCHANGING;

  let title = t('intro.title');
  let description: ReactNode = t('intro.description');
  if (isSuccess) {
    title = t('success.title');
    description = t('success.description');
  } else if (isEnableStep) {
    title = t('enable.title');
    description = t.rich('enable.description', {
      bold: (chunks) => <strong className="font-bold text-foreground">{chunks}</strong>,
    });
  } else if (isError) {
    title = t('error.title');
    description = t('error.description');
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        overrideDefaults
        className={CARD_CLASSNAME}
        // Focus the panel itself on open, not the first button. Radix otherwise auto-focuses
        // Cancel, whose programmatic focus trips :focus-visible → a 3px ring that reads as a thick
        // border. Focusing the panel keeps focus trapped (a11y) with no ring; Tab still rings
        // buttons normally for keyboard users.
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          (event.currentTarget as HTMLElement | null)?.focus();
        }}
      >
        <DialogHeader className="gap-1.5">
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription className={cn('text-base text-secondary-foreground', isEnableStep && 'tracking-[-0.5px]')}>
            {description}
          </DialogDescription>
        </DialogHeader>

        {isIntroPhase && <StepImage src="/images/locks-intro.webp" alt={title} />}

        {isServerUnavailable && (
          <Typography size="sm" className="text-center text-destructive">
            {t('serverUnavailable')}
          </Typography>
        )}

        {isEnableStep && (
          // min-h reserves the iframe's height so the loader states (spinner) don't collapse and
          // then jump when the iframe mounts.
          <Container className="flex min-h-[420px] flex-col items-center justify-center">
            {status === LocksAuthFlowStatus.AWAITING_APPROVAL && connectUrl ? (
              <iframe
                ref={iframeRef}
                src={connectUrl}
                title={t('iframeTitle')}
                // The parent accepts the auth code only from the configured Lock Server origin.
                // Without allow-same-origin, sandboxed postMessage uses origin "null" and gets rejected.
                // The other flags let /connect run JS, submit its approval form, and open Pubky Ring.
                // TODO:[Locks] #2001 — verify this sandbox set against the live /connect flow.
                sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
                className="h-[420px] w-full"
              />
            ) : (
              <LoaderCircle className="size-8 animate-spin text-brand" />
            )}
          </Container>
        )}

        {isSuccess && <StepImage src="/images/locks-enabled.webp" alt={title} />}

        {isError && (
          <Typography size="sm" className="text-destructive">
            {error?.message ?? t('error.fallback')}
          </Typography>
        )}

        {isIntroPhase && (
          <DialogFooter className="flex-row gap-4">
            <Button variant={ButtonVariant.OUTLINE} size="lg" className="flex-1" onClick={close}>
              {tCommon('cancel')}
            </Button>
            {/* Enabled only once the server is confirmed ready; a spinner shows while probing. */}
            <Button
              variant={ButtonVariant.DEFAULT}
              size="lg"
              className="flex-1 disabled:pointer-events-auto disabled:cursor-not-allowed"
              disabled={status !== LocksAuthFlowStatus.IDLE}
              onClick={start}
            >
              {isCheckingServer ? <LoaderCircle className="size-5 animate-spin" /> : tCommon('continue')}
            </Button>
          </DialogFooter>
        )}

        {isSuccess && (
          <DialogFooter className="flex-row gap-4">
            <Button variant={ButtonVariant.OUTLINE} size="lg" className="flex-1" onClick={close}>
              {tCommon('cancel')}
            </Button>
            <Button
              variant={ButtonVariant.DEFAULT}
              size="lg"
              className="flex-1"
              onClick={() => {
                if (session) onSuccess(session);
                close();
              }}
            >
              {tCommon('continue')}
            </Button>
          </DialogFooter>
        )}

        {isError && (
          <DialogFooter className="flex-row gap-4">
            <Button variant={ButtonVariant.OUTLINE} size="lg" className="flex-1" onClick={close}>
              {tCommon('cancel')}
            </Button>
            <Button variant={ButtonVariant.DEFAULT} size="lg" className="flex-1" onClick={start}>
              {t('tryAgain')}
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
