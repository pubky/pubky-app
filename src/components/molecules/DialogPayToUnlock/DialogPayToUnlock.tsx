'use client';

import { useEffect, useState } from 'react';
import { CircleCheck } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { Button, ButtonVariant } from '@/atoms/Button/Button';
import { Container } from '@/atoms/Container/Container';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/atoms/Dialog/Dialog';
import { Spinner } from '@/atoms/Spinner/Spinner';
import { Typography } from '@/atoms/Typography/Typography';
import { BITKIT_APP_STORE_URL, BITKIT_PLAY_STORE_URL } from '@/config/externalLinks';
import { useCopyToClipboard } from '@/hooks/useCopyToClipboard/useCopyToClipboard';
import { useUserProfile } from '@/hooks/useUserProfile/useUserProfile';
import { generateBitkitContactDeeplink } from '@/libs/deeplink/deeplink';
import { getLockContentDisplay } from '@/libs/post/lockContentKind';
import { formatLockPrice } from '@/libs/utils/lockPrice';
import { cn, formatPublicKey, withPubkyPrefix } from '@/libs/utils/utils';
import { AppDownload } from '@/molecules/AppDownload/AppDownload';
import { LocksRegionNotice } from '@/molecules/LocksRegionNotice/LocksRegionNotice';
import { LockTitle } from '@/molecules/LockTitle/LockTitle';
import { PostHeaderUserInfo } from '@/molecules/PostHeaderUserInfo/PostHeaderUserInfo';
import { QR_HOVER_OPACITY } from '@/molecules/QrCodeSlot/QrCodeSlot';
import type { DialogPayToUnlockProps } from './DialogPayToUnlock.types';

const FIELD_LABEL_CLASS = 'text-xs font-medium tracking-widest text-muted-foreground uppercase';

const INSTALL_STEPS = ['Install Bitkit', 'Set up profile', 'Fund wallet'];
const BITKIT_LOGO = { src: '/images/bitkit-logo.svg', alt: 'Bitkit', width: 110 };

function CreatorAvatar({ authorId }: { authorId: string }) {
  const { profile } = useUserProfile(authorId);
  const userName = profile?.name ?? formatPublicKey({ key: withPubkyPrefix(authorId) });

  return (
    <PostHeaderUserInfo userId={authorId} userName={userName} avatarUrl={profile?.avatarUrl} showUserInfo={false} />
  );
}

function WaitingMessage({
  connectionState,
  walletSetupNeeded,
  isConnectionPending,
}: Pick<DialogPayToUnlockProps, 'connectionState' | 'walletSetupNeeded' | 'isConnectionPending'>) {
  if (connectionState === 'blocked') {
    return 'This creator cannot receive payments from you right now. Please contact support.';
  }
  if (walletSetupNeeded) {
    return 'Finish setting up Bitkit, then keep it open.';
  }
  if (connectionState === 'recovery_required') {
    return 'Your connection to this creator needs to be restored. Keep Bitkit open.';
  }
  if (isConnectionPending && connectionState === null) {
    return 'Checking your Bitkit connection…';
  }
  if (connectionState === 'handshake') {
    return 'Connecting to this creator. Keep Bitkit open.';
  }
  if (connectionState === 'none') {
    return 'Your Bitkit connection to this creator is not ready yet. Keep Bitkit open.';
  }
  return 'Check Bitkit for a payment request. Review and confirm it there when it appears.';
}

/**
 * Pay to Unlock modal. Purely presentational — `usePayToUnlock` owns the state machine.
 *
 * Opening the modal starts the purchase automatically once the reader has a wallet. Closing during a
 * submission, `waiting` or `finishing` is allowed — the stored bundle id safely resumes it on reopen — but it asks
 * first, because a spinner vanishing on its own reads as a lost payment. The install screen is the
 * exception: nothing has been submitted there, so that close goes through without asking.
 */
export function DialogPayToUnlock({
  open,
  onOpenChange,
  lockTitle,
  contentKind,
  authorId,
  price,
  stage,
  isStalled,
  handshakePubky,
  connectionState,
  isConnectionPending,
  walletSetupNeeded,
  isSubmitting,
  onRetry,
  onRecheck,
  onViewContent,
}: DialogPayToUnlockProps) {
  const { title: defaultTitle, Icon: KindIcon } = getLockContentDisplay(contentKind);
  // The install screen comes before any submission, so it never has a Noise link state to show.
  const isInstall = stage === 'install';
  const handshakeValue = handshakePubky ? withPubkyPrefix(handshakePubky) : null;
  const showQr = Boolean(handshakeValue) && stage === 'waiting';
  const hasNotice = connectionState === 'blocked' || connectionState === 'recovery_required' || walletSetupNeeded;
  const showSpinner =
    stage === 'checking' ||
    (stage === 'finishing' && !isStalled) ||
    (stage === 'waiting' && !showQr && !isStalled && !hasNotice);
  const showHandshakeSpinner = showQr && connectionState === 'handshake' && !isStalled && !hasNotice;
  const showPrimary = stage === 'retry' || stage === 'expired' || isInstall;
  const primaryLabel = isInstall ? 'I completed the steps' : 'Try again';
  // Downloading or retrying paid content must not look like another payment is required.
  const isPaid = stage === 'finishing' || stage === 'paid' || stage === 'unopened';
  const [isConfirmingClose, setIsConfirmingClose] = useState(false);
  // The parent can close the modal itself (an expired session), past this prompt's buttons, so the
  // prompt would otherwise still be up on the next open.
  useEffect(() => {
    if (!open) setIsConfirmingClose(false);
  }, [open]);
  const { copyToClipboard } = useCopyToClipboard();

  const handleOpenChange = (next: boolean) => {
    // Paid content is already in memory. Closing should reveal that copy instead of enabling the
    // background recovery path, which would download the same content again.
    if (!next && stage === 'paid') {
      onViewContent();
      return;
    }
    // `isSubmitting` covers the gap before `waiting`, while the submission is in flight.
    // On the install screen it is only the wallet check, and nothing is running yet.
    if (!next && (stage === 'waiting' || stage === 'finishing' || (isSubmitting && !isInstall))) {
      setIsConfirmingClose(true);
      return;
    }
    onOpenChange(next);
  };

  const confirmClose = () => {
    setIsConfirmingClose(false);
    // The payment can finish while this prompt is open. Show the content we already downloaded
    // instead of throwing it away and downloading it again later.
    if (stage === 'paid') {
      onViewContent();
      return;
    }
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className="w-full max-w-md rounded-xl border-x-0 border-y border-brand bg-card sm:max-w-xl"
        // Clicks bubble through the portal to the post card, which would navigate to the post.
        onClick={(e) => e.stopPropagation()}
      >
        <DialogHeader>
          {/* The header tells the same story as the body (#2516): "Unlocked" only once the content is ready.
              While it opens, or after it failed to, the payment is received but nothing is unlocked yet. */}
          <DialogTitle>{stage === 'paid' ? 'Unlocked' : isPaid ? 'Payment received' : 'Pay to Unlock'}</DialogTitle>
        </DialogHeader>

        <Container overrideDefaults className="flex min-w-0 items-center gap-2 rounded-md bg-muted p-6">
          <KindIcon className="size-6 shrink-0 text-muted-foreground" aria-hidden />
          <Typography className="min-w-0 flex-1 text-xl font-bold wrap-anywhere text-foreground">
            <LockTitle title={lockTitle || defaultTitle} mentionClassName="text-xl" interactive={false} />
          </Typography>
          <CreatorAvatar authorId={authorId} />
        </Container>

        <Container
          overrideDefaults
          className="flex flex-col gap-6 rounded-md border border-dashed border-input p-6 lg:flex-row lg:items-start"
        >
          <Container overrideDefaults className="flex min-w-0 flex-1 flex-col gap-3">
            <Container overrideDefaults className="flex flex-col gap-1">
              <Typography className={cn(FIELD_LABEL_CLASS, isPaid && 'text-brand')}>
                {isPaid ? 'PAYMENT RECEIVED' : 'COST TO UNLOCK'}
              </Typography>
              <Typography className="text-2xl font-bold text-foreground">
                {formatLockPrice(price, { space: true })}
              </Typography>
            </Container>

            {isInstall && (
              <Container overrideDefaults className="flex flex-wrap gap-x-3 gap-y-1">
                {INSTALL_STEPS.map((step, index) => (
                  <Typography key={step} className="text-base text-secondary-foreground">
                    <span className="font-bold">{`${index + 1}) `}</span>
                    {step}
                  </Typography>
                ))}
              </Container>
            )}

            {/* A parked wait shows only its Check again copy; the notices still apply there. */}
            {stage === 'waiting' && (hasNotice || !isStalled) && (
              <Container overrideDefaults className="flex items-start gap-2">
                {showHandshakeSpinner && <Spinner size="sm" className="mt-1 shrink-0" />}
                <Typography className="text-base text-secondary-foreground">
                  <WaitingMessage
                    connectionState={connectionState}
                    walletSetupNeeded={walletSetupNeeded}
                    isConnectionPending={isConnectionPending}
                  />
                </Typography>
              </Container>
            )}

            {showQr && handshakeValue && (
              <>
                <Typography className="text-base text-secondary-foreground">
                  <span className="hidden lg:inline">
                    {'If this creator is not in your Bitkit contacts, scan this code to add them.'}
                  </span>
                  <span className="lg:hidden">{'If this creator is not in your Bitkit contacts, add them.'}</span>
                </Typography>
                {/* A phone cannot scan its own screen, so mobile hands the same pubky over by deeplink. */}
                <Button
                  asChild
                  variant={ButtonVariant.DEFAULT}
                  size="lg"
                  className="w-full lg:hidden"
                  data-cy="pay-to-unlock-bitkit-link"
                >
                  <a href={generateBitkitContactDeeplink(handshakeValue)}>{'Open in Bitkit'}</a>
                </Button>
              </>
            )}

            {/* Parked, not failed: the purchase is alive, so the reader gets a way back to it rather
              than a spinner that never resolves. */}
            {(stage === 'waiting' || stage === 'finishing') && isStalled && (
              <Container overrideDefaults className="flex flex-col items-start gap-3">
                <Typography className="text-base text-secondary-foreground">
                  {stage === 'finishing'
                    ? 'Your payment is complete. Check again to open the content.'
                    : 'This purchase is still pending. Check Bitkit, then check again here.'}
                </Typography>
                <Button variant={ButtonVariant.OUTLINE} size="lg" onClick={onRecheck} data-cy="pay-to-unlock-recheck">
                  {'Check again'}
                </Button>
              </Container>
            )}

            {stage === 'finishing' && !isStalled && (
              <Typography className="text-base text-secondary-foreground">{'Opening your content…'}</Typography>
            )}

            {stage === 'retry' && (
              <Typography className="text-base text-secondary-foreground">
                {'The payment could not continue. Try again when Bitkit is ready.'}
              </Typography>
            )}

            {stage === 'expired' && (
              <Typography className="text-base text-secondary-foreground">
                {'The payment was not completed. You can try again.'}
              </Typography>
            )}

            {showPrimary && (
              <AppDownload
                logo={BITKIT_LOGO}
                appStoreUrl={BITKIT_APP_STORE_URL}
                playStoreUrl={BITKIT_PLAY_STORE_URL}
                layout="row"
              />
            )}

            {stage === 'paid' && (
              <Typography className="text-base text-secondary-foreground">
                <span className="hidden lg:inline">{'Unlocked. '}</span>
                {'Thank you for supporting creators!'}
              </Typography>
            )}

            {stage === 'unopened' && (
              <Container overrideDefaults className="flex flex-col items-center gap-3 py-4">
                <Typography className="text-center text-base text-secondary-foreground">
                  {'Payment received. The content could not be opened — nothing is lost.'}
                </Typography>
                <Button variant={ButtonVariant.OUTLINE} size="lg" onClick={onRecheck} data-cy="pay-to-unlock-recheck">
                  {'Check again'}
                </Button>
              </Container>
            )}

            {/* Not retryable and nothing to do with Bitkit: no Try again, no store badges, just the why. */}
            {stage === 'region-blocked' && <LocksRegionNotice />}

            {stage === 'blocked' && (
              <Typography className="text-base text-secondary-foreground">
                {'This purchase could not be checked. Close the dialog and try again.'}
              </Typography>
            )}
          </Container>

          {showQr && handshakeValue && (
            // Same affordance as the session-upgrade QR: a wallet on a device without a camera needs the value itself.
            <Button
              overrideDefaults
              type="button"
              onClick={() => copyToClipboard(handshakeValue)}
              aria-label="Copy creator pubky"
              data-cy="pay-to-unlock-handshake-qr"
              className="group hidden shrink-0 cursor-pointer self-center rounded-md bg-foreground p-2 lg:block"
            >
              <QRCodeSVG value={handshakeValue} size={112} className={QR_HOVER_OPACITY} />
            </Button>
          )}

          {showSpinner && (
            <Container
              overrideDefaults
              className="flex shrink-0 flex-col items-center gap-3 self-center lg:size-24 lg:justify-center"
            >
              <Spinner size="md" />
            </Container>
          )}

          {stage === 'paid' && (
            <Container
              overrideDefaults
              className="flex size-24 shrink-0 items-center justify-center self-center"
              aria-hidden
            >
              <CircleCheck className="size-[72px] text-brand" strokeWidth={0.5} />
            </Container>
          )}
        </Container>

        <DialogFooter>
          {stage === 'paid' ? (
            <Button
              variant={ButtonVariant.DEFAULT}
              size="lg"
              className="flex-1"
              onClick={onViewContent}
              data-cy="pay-to-unlock-view-content"
            >
              {'View Content'}
            </Button>
          ) : (
            <Button
              variant={ButtonVariant.OUTLINE}
              size="lg"
              className="flex-1"
              onClick={() => handleOpenChange(false)}
              data-cy="pay-to-unlock-cancel"
            >
              {/* Past submission there is nothing to cancel — the purchase continues server-side. */}
              {stage === 'waiting' || stage === 'region-blocked' || isPaid ? 'Close' : 'Cancel'}
            </Button>
          )}
          {showPrimary && (
            <Button
              variant={ButtonVariant.DEFAULT}
              size="lg"
              className="flex-1"
              onClick={onRetry}
              disabled={isSubmitting}
              data-cy="pay-to-unlock-retry"
            >
              {isSubmitting ? <Spinner size="sm" /> : primaryLabel}
            </Button>
          )}
        </DialogFooter>

        {/* Nested inside the parent dialog to avoid mobile touch event issues with sibling portals */}
        <Dialog open={isConfirmingClose} onOpenChange={setIsConfirmingClose}>
          <DialogContent className="w-full max-w-md rounded-xl bg-card sm:max-w-md">
            <DialogHeader>
              <DialogTitle>{isPaid ? 'Payment received' : 'The payment is still running'}</DialogTitle>
            </DialogHeader>
            <Typography className="text-base text-secondary-foreground">
              {isPaid
                ? 'Your payment is complete. You can open this post again to access your content.'
                : 'Your payment to unlock this post has not finished yet. It keeps running if you close this, and you can open it again to come back to it.'}
            </Typography>
            <DialogFooter>
              <Button
                variant={ButtonVariant.OUTLINE}
                size="lg"
                className="flex-1"
                onClick={() => setIsConfirmingClose(false)}
                data-cy="pay-to-unlock-keep-waiting"
              >
                {'Keep waiting'}
              </Button>
              <Button
                variant={ButtonVariant.DESTRUCTIVE}
                size="lg"
                className="flex-1"
                onClick={confirmClose}
                data-cy="pay-to-unlock-close-anyway"
              >
                {'Close anyway'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </DialogContent>
    </Dialog>
  );
}
