'use client';

import { useState } from 'react';
import { CircleCheck, Newspaper } from 'lucide-react';
import { Button, ButtonVariant } from '@/atoms/Button/Button';
import { Container } from '@/atoms/Container/Container';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/atoms/Dialog/Dialog';
import { Spinner } from '@/atoms/Spinner/Spinner';
import { Typography } from '@/atoms/Typography/Typography';
import { BITKIT_APP_STORE_URL, BITKIT_PLAY_STORE_URL } from '@/config/externalLinks';
import { useUserProfile } from '@/hooks/useUserProfile/useUserProfile';
import { DEFAULT_LOCK_TITLE } from '@/libs/post/lockTeaser';
import { formatSats } from '@/libs/utils/formatSats';
import { cn, formatPublicKey, withPubkyPrefix } from '@/libs/utils/utils';
import { AppDownload } from '@/molecules/AppDownload/AppDownload';
import { PostHeaderUserInfo } from '@/molecules/PostHeaderUserInfo/PostHeaderUserInfo';
import type { DialogPayToUnlockProps } from './DialogPayToUnlock.types';

const FIELD_LABEL_CLASS = 'text-xs font-medium tracking-widest text-muted-foreground uppercase';

const INSTALL_STEPS = ['Install Bitkit', 'Set up your profile with the same pubky', 'Fund your wallet'];
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
 * The primary button is the start of the payment: nothing is submitted before it is pressed, so
 * opening and closing the modal is always safe. Closing during `waiting` is allowed too — the
 * purchase lives on the server and the stored bundle id picks it back up on reopen — but it asks
 * first, because a spinner vanishing on its own reads as a lost payment.
 */
export function DialogPayToUnlock({
  open,
  onOpenChange,
  lockTitle,
  authorId,
  priceSats,
  stage,
  isStalled,
  isSubmitting,
  onSubmit,
  onRecheck,
  onViewContent,
}: DialogPayToUnlockProps) {
  const isInstall = stage === 'install';
  const showPrimary = stage === 'pay' || stage === 'install';
  const [isConfirmingClose, setIsConfirmingClose] = useState(false);

  const handleOpenChange = (next: boolean) => {
    // Paid content is already in memory. Closing should reveal that copy instead of enabling the
    // background recovery path, which would download the same content again.
    if (!next && stage === 'paid') {
      onViewContent();
      return;
    }
    // `isSubmitting` covers the gap before `waiting`: the submission is already in flight while the
    // body still shows the pay screen, and on a slow connection that lasts seconds.
    if (!next && (stage === 'waiting' || isSubmitting)) {
      setIsConfirmingClose(true);
      return;
    }
    onOpenChange(next);
  };

  const confirmClose = () => {
    setIsConfirmingClose(false);
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

        <Container overrideDefaults className="flex items-center gap-2 rounded-md bg-muted p-6">
          <Newspaper className="size-6 shrink-0 text-muted-foreground" aria-hidden />
          <Typography className="min-w-0 flex-1 truncate text-xl font-bold text-foreground">
            {lockTitle || DEFAULT_LOCK_TITLE}
          </Typography>
          <CreatorAvatar authorId={authorId} />
        </Container>

        <Container overrideDefaults className="flex items-start gap-6 rounded-md border border-dashed border-input p-6">
          <Container overrideDefaults className="flex min-w-0 flex-1 flex-col gap-3">
            <Container overrideDefaults className="flex flex-col gap-1">
              <Typography className={cn(FIELD_LABEL_CLASS, stage === 'paid' && 'text-brand')}>
                {stage === 'paid' ? 'PAYMENT RECEIVED' : 'COST TO UNLOCK'}
              </Typography>
              <Typography className="text-2xl font-bold text-foreground">
                {formatSats(priceSats, { space: true })}
              </Typography>
            </Container>

            {stage === 'checking' && (
              <Container overrideDefaults className="flex items-center justify-center py-4">
                <Spinner size="md" />
              </Container>
            )}

            {stage === 'pay' && (
              <>
                <Typography className="text-base text-secondary-foreground">
                  {'Open your Bitkit wallet and pay to unlock.'}
                </Typography>
                <AppDownload
                  logo={BITKIT_LOGO}
                  appStoreUrl={BITKIT_APP_STORE_URL}
                  playStoreUrl={BITKIT_PLAY_STORE_URL}
                  layout="row"
                />
              </>
            )}

            {isInstall && (
              <>
                <Container overrideDefaults className="flex flex-col gap-1">
                  {INSTALL_STEPS.map((step, index) => (
                    <Typography key={step} className="text-base text-secondary-foreground">
                      <span className="font-bold">{`${index + 1}) `}</span>
                      {step}
                    </Typography>
                  ))}
                </Container>
                <AppDownload
                  logo={BITKIT_LOGO}
                  appStoreUrl={BITKIT_APP_STORE_URL}
                  playStoreUrl={BITKIT_PLAY_STORE_URL}
                  layout="row"
                />
              </>
            )}

            {stage === 'waiting' && (
              <Container overrideDefaults className="flex flex-col items-center gap-3 py-4">
                {/* Parked, not failed: the purchase is alive, so the reader gets a way back to it
                  rather than a spinner that never resolves. */}
                {isStalled ? (
                  <>
                    <Typography className="text-center text-base text-secondary-foreground">
                      {'Still waiting for the payment. Pay in Bitkit, then check again.'}
                    </Typography>
                    <Button
                      variant={ButtonVariant.OUTLINE}
                      size="lg"
                      onClick={onRecheck}
                      data-cy="pay-to-unlock-recheck"
                    >
                      {'Check again'}
                    </Button>
                  </>
                ) : (
                  <>
                    <Spinner size="md" />
                    <Typography className={FIELD_LABEL_CLASS}>{'AWAITING PAYMENT'}</Typography>
                  </>
                )}
              </Container>
            )}

            {stage === 'paid' && (
              <Typography className="text-base text-secondary-foreground">
                {'Unlocked. Thank you for supporting creators!'}
              </Typography>
            )}

            {stage === 'blocked' && (
              <Typography className="text-base text-secondary-foreground">
                {'This purchase could not be checked. Close the dialog and try again.'}
              </Typography>
            )}
          </Container>

          {stage === 'paid' && (
            <Container overrideDefaults className="flex size-24 shrink-0 items-center justify-center" aria-hidden>
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
              {stage === 'waiting' ? 'Close' : 'Cancel'}
            </Button>
          )}
          {showPrimary && (
            <Button
              variant={ButtonVariant.DEFAULT}
              size="lg"
              className="flex-1"
              onClick={onSubmit}
              disabled={isSubmitting}
              data-cy="pay-to-unlock-submit"
            >
              {isSubmitting ? <Spinner size="sm" /> : isInstall ? 'I completed the steps' : 'Pay with Bitkit'}
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
