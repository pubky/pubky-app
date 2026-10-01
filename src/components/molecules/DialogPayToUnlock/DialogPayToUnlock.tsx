'use client';

import { useState } from 'react';
import { CircleCheck, Newspaper } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { Button, ButtonVariant } from '@/atoms/Button/Button';
import { Container } from '@/atoms/Container/Container';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/atoms/Dialog/Dialog';
import { Spinner } from '@/atoms/Spinner/Spinner';
import { Typography } from '@/atoms/Typography/Typography';
import { BITKIT_APP_STORE_URL, BITKIT_PLAY_STORE_URL } from '@/config/externalLinks';
import { useUserProfile } from '@/hooks/useUserProfile/useUserProfile';
import { generateBitkitContactDeeplink } from '@/libs/deeplink/deeplink';
import { DEFAULT_LOCK_TITLE } from '@/libs/post/lockTeaser';
import { formatSats } from '@/libs/utils/formatSats';
import { cn, formatPublicKey, withPubkyPrefix } from '@/libs/utils/utils';
import { AppDownload } from '@/molecules/AppDownload/AppDownload';
import { PostHeaderUserInfo } from '@/molecules/PostHeaderUserInfo/PostHeaderUserInfo';
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

/**
 * Pay to Unlock modal. Purely presentational — `usePayToUnlock` owns the state machine.
 *
 * Opening the modal starts the purchase automatically once the reader has a wallet. Closing during a
 * submission or `waiting` is allowed — the stored bundle id safely resumes it on reopen — but it asks
 * first, because a spinner vanishing on its own reads as a lost payment. The install screen is the
 * exception: nothing has been submitted there, so that close goes through without asking.
 */
export function DialogPayToUnlock({
  open,
  onOpenChange,
  lockTitle,
  authorId,
  priceSats,
  stage,
  isStalled,
  handshakePubky,
  connectionIssue,
  isSubmitting,
  onRetry,
  onRecheck,
  onViewContent,
}: DialogPayToUnlockProps) {
  // The install screen comes before any submission, so it never has a Noise link state to show.
  const isInstall = stage === 'install';
  const showQr = Boolean(handshakePubky) && stage === 'waiting';
  const showSpinner = stage === 'checking' || (stage === 'waiting' && !showQr && !isStalled && !connectionIssue);
  const showPrimary = stage === 'retry' || isInstall;
  const primaryLabel = isInstall ? 'I completed the steps' : 'Try again';
  // `unopened` reached this screen by a completed payment too, so it must not show a cost to pay.
  const isPaid = stage === 'paid' || stage === 'unopened';
  const [isConfirmingClose, setIsConfirmingClose] = useState(false);

  const handleOpenChange = (next: boolean) => {
    // Paid content is already in memory. Closing should reveal that copy instead of enabling the
    // background recovery path, which would download the same content again.
    if (!next && stage === 'paid') {
      onViewContent();
      return;
    }
    // `isSubmitting` covers the gap before `waiting`, while the submission is in flight.
    // On the install screen it is only the wallet check, and nothing is running yet.
    if (!next && (stage === 'waiting' || (isSubmitting && !isInstall))) {
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
          <DialogTitle>{stage === 'paid' ? 'Unlocked' : 'Pay to Unlock'}</DialogTitle>
        </DialogHeader>

        <Container overrideDefaults className="flex min-w-0 items-center gap-2 rounded-md bg-muted p-6">
          <Newspaper className="size-6 shrink-0 text-muted-foreground" aria-hidden />
          <Typography className="min-w-0 flex-1 text-xl font-bold wrap-anywhere text-foreground">
            {lockTitle || DEFAULT_LOCK_TITLE}
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
                {formatSats(priceSats, { space: true })}
              </Typography>
            </Container>

            {showQr && handshakePubky && (
              <>
                <Typography className="text-base text-secondary-foreground">
                  {'Scan with Bitkit and pay to unlock.'}
                </Typography>
                {/* A phone cannot scan its own screen, so mobile hands the same pubky over by deeplink. */}
                <Button
                  asChild
                  variant={ButtonVariant.DEFAULT}
                  size="lg"
                  className="w-full lg:hidden"
                  data-cy="pay-to-unlock-bitkit-link"
                >
                  <a href={generateBitkitContactDeeplink(withPubkyPrefix(handshakePubky))}>{'Pay with Bitkit'}</a>
                </Button>
              </>
            )}

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

            {/* A parked wait shows only its Check again copy; the link notices still apply there. */}
            {stage === 'waiting' && !showQr && (connectionIssue || !isStalled) && (
              <Typography className="text-base text-secondary-foreground">
                {connectionIssue === 'blocked' ? (
                  'This creator cannot receive payments from you right now. Please contact support.'
                ) : connectionIssue === 'recovery_required' ? (
                  'Your Bitkit connection to this creator is being restored. Keep Bitkit open while we reconnect.'
                ) : (
                  <>
                    <span className="hidden lg:inline">{'Awaiting payment. '}</span>
                    {'Please confirm in Bitkit.'}
                  </>
                )}
              </Typography>
            )}

            {/* Parked, not failed: the purchase is alive, so the reader gets a way back to it rather
              than a spinner that never resolves. */}
            {stage === 'waiting' && isStalled && (
              <Container overrideDefaults className="flex flex-col items-start gap-3">
                <Typography className="text-base text-secondary-foreground">
                  {'Still waiting for the payment. Pay in Bitkit, then check again.'}
                </Typography>
                <Button variant={ButtonVariant.OUTLINE} size="lg" onClick={onRecheck} data-cy="pay-to-unlock-recheck">
                  {'Check again'}
                </Button>
              </Container>
            )}

            {stage === 'retry' && (
              <Typography className="text-base text-secondary-foreground">
                {'The payment could not continue. Try again when Bitkit is ready.'}
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

            {stage === 'blocked' && (
              <Typography className="text-base text-secondary-foreground">
                {'This purchase could not be checked. Close the dialog and try again.'}
              </Typography>
            )}
          </Container>

          {showQr && handshakePubky && (
            <Container
              overrideDefaults
              role="img"
              aria-label="Creator Pubky QR code"
              data-cy="pay-to-unlock-handshake-qr"
              className="hidden shrink-0 self-center rounded-md bg-foreground p-2 lg:block"
            >
              <QRCodeSVG value={withPubkyPrefix(handshakePubky)} size={112} />
            </Container>
          )}

          {showSpinner && (
            <Container
              overrideDefaults
              className="flex shrink-0 flex-col items-center gap-3 self-center lg:size-24 lg:justify-center"
            >
              <Spinner size="md" />
              {stage === 'waiting' && (
                <Typography className={cn(FIELD_LABEL_CLASS, 'lg:hidden')}>{'AWAITING PAYMENT'}</Typography>
              )}
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
              {stage === 'waiting' || stage === 'unopened' ? 'Close' : 'Cancel'}
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
              <DialogTitle>{'The payment is still running'}</DialogTitle>
            </DialogHeader>
            <Typography className="text-base text-secondary-foreground">
              {
                'Your payment to unlock this post has not finished yet. It keeps running if you close this, and you can open it again to come back to it.'
              }
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
