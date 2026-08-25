'use client';

/**
 * DialogLocksAuth
 *
 * Four-step modal that sets a creator up for Locks (Intro → Enable Locks → Enable Payments → Enabled):
 *  1. Intro          — explains Locks; "Continue" begins the flow.
 *  2. Enable Locks   — iframe loads the Lock Server `/connect` page. On approval it posts the code
 *                      to the parent and `useLocksAuthFlow` exchanges it.
 *  3. Enable Payments — iframe loads Paykit's `/setup` page, where the creator connects the account
 *                      that receives payments.
 *  4. Enabled        — success; "Continue" notifies the caller via `onSuccess` and closes.
 *
 * Which step shows is derived from the Locks store, so a creator who is already signed in but has
 * not connected Bitkit in this browser session opens straight at Enable Payments.
 */
import { type ReactNode, useEffect } from 'react';
import { LoaderCircle } from 'lucide-react';
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
import { Link } from '@/atoms/Link/Link';
import { Typography } from '@/atoms/Typography/Typography';
import {
  BITKIT_APP_STORE_URL,
  BITKIT_PLAY_STORE_URL,
  getAppStoreLink,
  getPlayStoreLink,
} from '@/config/externalLinks';
import { useLocksAuthFlow } from '@/hooks/useLocksAuthFlow/useLocksAuthFlow';
import { LocksAuthFlowStatus } from '@/hooks/useLocksAuthFlow/useLocksAuthFlow.types';
import { usePaykitSetupFlow } from '@/hooks/usePaykitSetupFlow/usePaykitSetupFlow';
import { PaykitSetupFlowStatus } from '@/hooks/usePaykitSetupFlow/usePaykitSetupFlow.types';
import { cn } from '@/libs/utils/utils';
import { isLocksAuthenticated as isLocksAuthenticatedState } from '@/stores/locksAuth/locksAuth.selectors';
import { useLocksAuthStore } from '@/stores/locksAuth/locksAuth.store';

type DialogLocksAuthProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
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

/** Wordmark + store badges under a step's QR. */
function AppDownload({
  logo,
  appStoreUrl,
  playStoreUrl,
}: {
  logo: { src: string; alt: string; width: number };
  appStoreUrl: string;
  playStoreUrl: string;
}) {
  return (
    <Container className="flex flex-col items-center gap-4">
      <Image src={logo.src} alt={logo.alt} width={logo.width} height={32} />
      <Container className="flex flex-row items-center justify-center gap-3.5">
        <Link href={appStoreUrl} target="_blank">
          <Image src="/images/badge-apple.webp" alt="App Store" width={72} height={24} />
        </Link>
        <Link href={playStoreUrl} target="_blank">
          <Image src="/images/badge-android.webp" alt="Google Play" width={81} height={24} />
        </Link>
      </Container>
    </Container>
  );
}

export function DialogLocksAuth({ open, onOpenChange, onSuccess }: DialogLocksAuthProps) {
  const {
    status: locksStatus,
    connectUrl,
    error: locksError,
    iframeRef: locksIframeRef,
    prepare,
    start: startLocks,
    reset: resetLocks,
  } = useLocksAuthFlow();
  const {
    status: paykitStatus,
    setupUrl,
    error: paykitError,
    iframeRef: paykitIframeRef,
    start: startPaykit,
    reset: resetPaykit,
  } = usePaykitSetupFlow();
  const isLocksAuthenticated = isLocksAuthenticatedState(useLocksAuthStore((state) => state.session));
  const isPaykitConnected = useLocksAuthStore((state) => state.paykitConnected);

  const step = !isLocksAuthenticated ? 'locks' : !isPaykitConnected ? 'bitkit' : 'done';

  // Probe the Lock Server's readiness when the modal opens; reset when it closes. "Continue" only
  // starts the auth flow once the probe says the server is ready. Read the store here rather than
  // depending on `step`, so opening straight at a later step skips the probe entirely.
  useEffect(() => {
    if (!open) {
      resetLocks();
      resetPaykit();
      return;
    }
    if (!isLocksAuthenticatedState(useLocksAuthStore.getState().session)) prepare();
  }, [open, prepare, resetLocks, resetPaykit]);

  // The Paykit page is the whole step, so open it on arrival rather than behind another "Continue".
  useEffect(() => {
    if (open && step === 'bitkit' && paykitStatus === PaykitSetupFlowStatus.IDLE) startPaykit();
  }, [open, step, paykitStatus, startPaykit]);

  const close = () => onOpenChange(false);
  const isSuccess = step === 'done';
  const isCheckingServer = locksStatus === LocksAuthFlowStatus.CHECKING_SERVER;
  const isServerUnavailable = locksStatus === LocksAuthFlowStatus.SERVER_UNAVAILABLE;
  const isLocksError = step === 'locks' && locksStatus === LocksAuthFlowStatus.ERROR;
  const isPaykitError = step === 'bitkit' && paykitStatus === PaykitSetupFlowStatus.ERROR;
  const isError = isLocksError || isPaykitError;
  // Intro step: the readiness probe (checking / ready / unavailable), before the auth iframe.
  const isIntroPhase =
    step === 'locks' && (isCheckingServer || isServerUnavailable || locksStatus === LocksAuthFlowStatus.IDLE);
  const isEnableStep =
    step === 'locks' &&
    (locksStatus === LocksAuthFlowStatus.CONNECTING ||
      locksStatus === LocksAuthFlowStatus.AWAITING_APPROVAL ||
      locksStatus === LocksAuthFlowStatus.EXCHANGING);
  const isBitkitStep = step === 'bitkit' && !isPaykitError;

  const bold = (chunks: ReactNode) => <strong className="font-bold text-foreground">{chunks}</strong>;

  let title = 'Lock Content';
  let description: ReactNode = 'Pubky Locks allows you to lock content with payments or passwords.';
  if (isSuccess) {
    title = 'Locks Enabled';
    description = 'You authorized the Locks server to manage your Locks data.';
  } else if (isEnableStep) {
    title = 'Enable Locks';
    description = (
      <>
        {'Use '}
        {bold('Pubky Ring')}
        {' to authorize Locks server to manage your Locks data.'}
      </>
    );
  } else if (isBitkitStep) {
    title = 'Enable Payments';
    description = (
      <>
        {'Scan this QR with your '}
        {bold('Bitkit')}
        {' wallet to enable payments.'}
      </>
    );
  } else if (isPaykitError) {
    title = 'Enable Payments';
    description = 'Something went wrong while connecting your Bitkit wallet.';
  } else if (isLocksError) {
    title = 'Enable Locks';
    description = 'Something went wrong while authorizing the Lock Server.';
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
        <DialogHeader className="gap-6">
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription className={cn('text-base text-secondary-foreground', isEnableStep && 'tracking-[-0.5px]')}>
            {description}
          </DialogDescription>
        </DialogHeader>

        {isIntroPhase && <StepImage src="/images/locks-intro.webp" alt={title} />}

        {isServerUnavailable && (
          <Typography size="sm" className="text-center text-destructive">
            {'The Lock Server is unavailable right now. Please try again later.'}
          </Typography>
        )}

        {isEnableStep && (
          // min-h reserves the iframe's height so the loader states (spinner) don't collapse and
          // then jump when the iframe mounts.
          <Container className="flex flex-col items-center justify-center gap-6 py-3">
            {/* The shell's embed layout is the 192px QR panel, or the deep-link button on touch.
                It also posts a `locks-auth-resize` height we could adopt instead, but a fixed box
                keeps the loader from collapsing before the iframe mounts. */}
            <Container className="flex min-h-[192px] w-full items-center justify-center [@media(hover:none)and(pointer:coarse)]:min-h-[60px]">
              {locksStatus === LocksAuthFlowStatus.AWAITING_APPROVAL && connectUrl ? (
                <iframe
                  ref={locksIframeRef}
                  src={connectUrl}
                  title={'Lock Server authorization'}
                  // The parent accepts the auth code only from the configured Lock Server origin.
                  // Without allow-same-origin, sandboxed postMessage uses origin "null" and gets rejected.
                  // The other flags let /connect run JS, submit its approval form, and open Pubky Ring.
                  sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
                  className="h-[192px] w-full [@media(hover:none)and(pointer:coarse)]:h-[60px]"
                />
              ) : (
                <LoaderCircle className="size-8 animate-spin text-brand" />
              )}
            </Container>
            {/* The shell hides its own wordmark on desktop, so the embedder carries it (Figma
                "Dialog / Lock / EnableLocks"). */}
            <AppDownload
              logo={{ src: '/images/logo-pubky-ring.svg', alt: 'Pubky Ring', width: 147 }}
              appStoreUrl={getAppStoreLink()}
              playStoreUrl={getPlayStoreLink()}
            />
          </Container>
        )}

        {isBitkitStep && (
          <Container className="flex flex-col items-center justify-center gap-6 py-3">
            <Container className="flex min-h-[192px] w-full items-center justify-center [@media(hover:none)and(pointer:coarse)]:min-h-[60px]">
              {setupUrl ? (
                <iframe
                  ref={paykitIframeRef}
                  src={setupUrl}
                  title={'Bitkit payout account setup'}
                  // Same origin rule as the Lock Server iframe above: without allow-same-origin a
                  // sandboxed postMessage arrives as origin "null" and is rejected. allow-popups is
                  // for the Bitkit deep link Paykit's page opens on touch devices.
                  sandbox="allow-scripts allow-same-origin allow-popups"
                  className="h-[192px] w-full [@media(hover:none)and(pointer:coarse)]:h-[60px]"
                />
              ) : (
                <LoaderCircle className="size-8 animate-spin text-brand" />
              )}
            </Container>
            <AppDownload
              logo={{ src: '/images/bitkit-logo.svg', alt: 'Bitkit', width: 110 }}
              appStoreUrl={BITKIT_APP_STORE_URL}
              playStoreUrl={BITKIT_PLAY_STORE_URL}
            />
          </Container>
        )}

        {isSuccess && <StepImage src="/images/locks-enabled.webp" alt={title} />}

        {isError && (
          <Typography size="sm" className="text-destructive">
            {(isPaykitError ? paykitError?.message : locksError?.message) ?? 'Lock authorization failed.'}
          </Typography>
        )}

        {isIntroPhase && (
          <DialogFooter className="flex-row gap-4">
            <Button variant={ButtonVariant.OUTLINE} size="lg" className="flex-1" onClick={close}>
              {'Cancel'}
            </Button>
            {/* Enabled only once the server is confirmed ready; a spinner shows while probing. */}
            <Button
              variant={ButtonVariant.DEFAULT}
              size="lg"
              className="flex-1 disabled:pointer-events-auto disabled:cursor-not-allowed"
              disabled={locksStatus !== LocksAuthFlowStatus.IDLE}
              onClick={startLocks}
            >
              {isCheckingServer ? <LoaderCircle className="size-5 animate-spin" /> : 'Continue'}
            </Button>
          </DialogFooter>
        )}

        {isSuccess && (
          <DialogFooter className="flex-row gap-4">
            <Button variant={ButtonVariant.OUTLINE} size="lg" className="flex-1" onClick={close}>
              {'Cancel'}
            </Button>
            <Button
              variant={ButtonVariant.DEFAULT}
              size="lg"
              className="flex-1"
              onClick={() => {
                onSuccess();
                close();
              }}
            >
              {'Continue'}
            </Button>
          </DialogFooter>
        )}

        {isError && (
          <DialogFooter className="flex-row gap-4">
            <Button variant={ButtonVariant.OUTLINE} size="lg" className="flex-1" onClick={close}>
              {'Cancel'}
            </Button>
            <Button
              variant={ButtonVariant.DEFAULT}
              size="lg"
              className="flex-1"
              onClick={isPaykitError ? startPaykit : startLocks}
            >
              {'Try again'}
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
