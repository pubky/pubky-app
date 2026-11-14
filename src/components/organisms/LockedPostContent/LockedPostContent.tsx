'use client';

import { useState } from 'react';
import { usePathname } from 'next/navigation';
import { isPostRoute } from '@/app/routes';
import { Container } from '@/atoms/Container/Container';
import { LocksController } from '@/controllers/locks/locks';
import { useLockFile } from '@/hooks/useLockFile/useLockFile';
import { usePaidUnlockAvailability } from '@/hooks/usePaidUnlockAvailability/usePaidUnlockAvailability';
import { usePayToUnlock } from '@/hooks/usePayToUnlock/usePayToUnlock';
import { usePurchasedLocks } from '@/hooks/usePurchasedLocks/usePurchasedLocks';
import { usePurchaseResume } from '@/hooks/usePurchaseResume/usePurchaseResume';
import { useRequireAuth } from '@/hooks/useRequireAuth/useRequireAuth';
import { useSessionNeedsUpgrade } from '@/hooks/useSessionNeedsUpgrade/useSessionNeedsUpgrade';
import { useUnlockedContent } from '@/hooks/useUnlockedContent/useUnlockedContent';
import { useUnlockPillHold } from '@/hooks/useUnlockPillHold/useUnlockPillHold';
import { isArticleContent } from '@/libs/post/articleContent';
import { cn } from '@/libs/utils/utils';
import { parseCompositeId } from '@/models/models.utils';
import type { PostDetailsModel } from '@/models/post/details/postDetails';
import { DialogPayToUnlock } from '@/molecules/DialogPayToUnlock/DialogPayToUnlock';
import { LockAccessLabel } from '@/molecules/LockAccessLabel/LockAccessLabel';
import { LockedPostCard } from '@/molecules/LockedPostCard/LockedPostCard';
import { LocksRegionNotice } from '@/molecules/LocksRegionNotice/LocksRegionNotice';
import { LocksPermissionNotice } from '@/organisms/LocksPermissionNotice/LocksPermissionNotice';
import type { AttachmentConstructed } from '@/organisms/PostAttachments/PostAttachments.types';
import { LockContentParser } from '@/pipes/locks/locks.parser';
import type { TUnlockedContent } from '@/services/locks/locks.types';
import { PostArticle } from '../PostArticle/PostArticle';
import { PostBody } from '../PostBody/PostBody';
import { PostContentBaseSkeleton } from '../PostContentBase/PostContentBase.skeleton';
import { useFocusedLock } from './FocusedLockContext';

interface LockedPostContentProps {
  content: string;
  lock: string | null | undefined;
  /** Composite id of this announcement post. Its author matches the signed-in user for an own lock. */
  postId: string;
  attachments?: PostDetailsModel['attachments'];
  /** Creator's local (not-yet-remote) attachments, so their own just-published media shows. */
  localAttachments?: AttachmentConstructed[];
  className?: string;
  textClassName?: string;
}

/**
 * Reader view of a lock post: announcement body + shared `LockedPostCard`, built from the parsed
 * announcement content and the fetched lock file. Its own component so the lock-file fetch runs only
 * for lock posts, not every post.
 */
export function LockedPostContent({
  content,
  lock,
  postId,
  attachments,
  localAttachments,
  className,
  textClassName,
}: LockedPostContentProps) {
  const [isPayOpen, setIsPayOpen] = useState(false);
  const { pubky: authorId } = parseCompositeId(postId);
  const pathname = usePathname();
  const lockContent = LocksController.getLockContent(content);
  // The post a post page shows has its lock read by the page, which keeps the content once it swaps
  // this card for the article layout. Anywhere else this card reads it, as a preview: an article loads
  // its cover alone (#2686).
  const focusedLock = useFocusedLock(postId);
  const ownLockFile = useLockFile(focusedLock ? null : lock);
  const { lockFile, price, isLoading: isLockFileLoading } = focusedLock?.lockFile ?? ownLockFile;
  const ownUnlocked = useUnlockedContent({ lock: focusedLock ? null : lock, lockFile, postId, preview: true });
  const {
    unlockedPost,
    applyUnlockedContent,
    media,
    pendingAttachments,
    hasCompleteContent,
    isOwnLock,
    isResolvingOwn,
    isResolvingReplica,
  } = focusedLock?.unlocked ?? ownUnlocked;
  const { waitForAuth, isAuthenticated } = useRequireAuth();
  // A session from before the app asked for `/priv` cannot read whether this reader already
  // unlocked, so ask for the permission first and keep the card inert: a second unlock would
  // charge them twice. Gated on the session, not on a refused read, so the card does not flip from
  // live to inert once that read fails.
  const showPermissionNotice = useSessionNeedsUpgrade();

  /** Renders unlocked content and closes whichever dialog produced it. */
  const showUnlockedContent = (unlocked: TUnlockedContent) => {
    setIsPayOpen(false);
    applyUnlockedContent(unlocked); // renders + replicates into the reader's /priv
  };

  // Paid but never received: the payment completed while the reader was away, so nothing on screen
  // would otherwise say so. Resolves itself, without the reader pressing anything.
  const { hasPurchase, markPurchased, status: purchasesStatus } = usePurchasedLocks({ enabled: price !== null });
  const lockId = lock ? LockContentParser.lockIdFromUrl(lock) : null;
  const purchaseStatus = usePurchaseResume({
    lock,
    lockFile,
    // The open modal owns status polling and completion. In particular, markPurchased must not
    // start a competing background finish immediately after a new payment is submitted.
    isPurchased: !isPayOpen && hasPurchase(lockId),
    // Cached text alone is not "received": with its bytes unreadable, recovery re-downloads the post.
    hasContent: hasCompleteContent,
    isResolvingContent: isResolvingReplica,
    onResumed: showUnlockedContent,
  });

  // A bundle file can predate any server task or outlive a failed payment. Only the read-only
  // resolver can establish the in-flight exemption. An unreadable listing/task keeps the modal
  // available for recovery, with new submissions guarded independently inside the pay hook.
  const paidUnlocks = usePaidUnlockAvailability();
  const isPayableReader = Boolean(price) && !isOwnLock;
  const isRecoverable = purchaseStatus === 'recoverable' || purchaseStatus === 'recovering';
  const canRecover = purchasesStatus === 'error' || purchaseStatus === 'unknown' || isRecoverable;
  const isPurchaseChecking = purchasesStatus === 'loading' || purchaseStatus === 'checking';
  const isRegionChecking =
    isPayableReader &&
    !canRecover &&
    paidUnlocks.status !== 'available' &&
    (paidUnlocks.status === 'checking' || isPurchaseChecking);
  // A reader who already unlocked this post is about to see their replicated copy, so the pill must not go
  // live in between (#2795), nor while recovery looks up, or downloads, a listed purchase whose copy was not
  // found (#3038).
  const isUnlockPillHeld = useUnlockPillHold({
    lock,
    isPayableReader,
    isPayOpen,
    isResolvingReplica,
    purchasesStatus,
    isListedPurchase: hasPurchase(lockId),
    purchaseStatus,
  });
  const regionBlock =
    isPayableReader && !isRecoverable && !isRegionChecking && paidUnlocks.status === 'blocked' ? paidUnlocks : null;

  const {
    stage,
    isStalled,
    handshakePubky,
    connectionState,
    isConnectionPending,
    walletSetupNeeded,
    isSubmitting,
    retry,
    recheck,
    viewContent,
  } = usePayToUnlock({
    open: isPayOpen,
    paymentAvailability: paidUnlocks.status,
    lockUrl: lock ?? '',
    lockFile,
    onPurchased: markPurchased,
    onCompleted: showUnlockedContent,
    onSessionExpired: () => setIsPayOpen(false),
  });

  if (!lockContent) return null;

  // Paying needs the reader's pubky (it is the payment-request delivery address), so a signed-out
  // reader gets the sign-in dialog instead. Unsupported legacy locks have no unlock handler, and
  // neither does the creator's own lock: it stays inert even if reading the original failed.
  const handleUnlock =
    price && !showPermissionNotice && !isOwnLock && (!regionBlock || canRecover) && !isRegionChecking
      ? async () => {
          if (await waitForAuth()) setIsPayOpen(true);
        }
      : undefined;

  return (
    <Container className={cn('min-w-0 gap-4', className)}>
      <PostBody
        content={lockContent.teaser_description}
        attachments={attachments ?? null}
        localAttachments={localAttachments}
        textClassName={textClassName}
      />
      {/* An own lock shows its layout as soon as lock.json proves it mine, with the content behind a
          skeleton: a large attachment must never leave an Unlock button on the creator's own post. */}
      {unlockedPost || isResolvingOwn ? (
        <>
          {/* Own lock: keep the (now inert) lock card above the content so the price/terms stay visible. */}
          {isOwnLock && (
            <LockedPostCard title={lockContent.lock_title} contentKind={lockContent.content_kind} price={price} />
          )}
          <div className="flex w-full flex-col gap-4" data-cy="locked-post-unlocked-content">
            <div className="border-t border-border" />
            <LockAccessLabel isOwnLock={isOwnLock} />
            {!unlockedPost ? (
              <PostContentBaseSkeleton />
            ) : unlockedPost.kind === 'long' && isArticleContent(unlockedPost.content) ? (
              <PostArticle
                content={unlockedPost.content}
                attachments={null}
                localAttachments={media}
                pendingAttachments={pendingAttachments}
              />
            ) : (
              <PostBody
                content={unlockedPost.content}
                attachments={null}
                localAttachments={media}
                // One row of media off the post page, so a many-image lock does not stretch the feed (#2868).
                // On a post page everything expands, replies, embeds and thread parents included, as PostText
                // truncates text only off post pages.
                collapseMedia={!isPostRoute(pathname)}
                textClassName={textClassName}
                pendingAttachments={pendingAttachments}
              />
            )}
          </div>
        </>
      ) : (
        <>
          {showPermissionNotice && <LocksPermissionNotice />}
          {regionBlock && <LocksRegionNotice cause={regionBlock.cause} />}
          <LockedPostCard
            title={lockContent.lock_title}
            contentKind={lockContent.content_kind}
            price={price}
            isLoading={isLockFileLoading || isRegionChecking || isUnlockPillHeld}
            unlockOpen={isPayOpen}
            onUnlock={handleUnlock}
            // A signed-out reader gets the sign-in dialog instead of the pay modal, and only a modal
            // closing snaps the button back.
            slideOnUnlock={isAuthenticated}
          />
        </>
      )}
      {price && (
        <DialogPayToUnlock
          open={isPayOpen}
          onOpenChange={setIsPayOpen}
          lockTitle={lockContent.lock_title}
          contentKind={lockContent.content_kind}
          authorId={authorId}
          price={price}
          stage={stage}
          isStalled={isStalled}
          handshakePubky={handshakePubky}
          connectionState={connectionState}
          isConnectionPending={isConnectionPending}
          walletSetupNeeded={walletSetupNeeded}
          isSubmitting={isSubmitting}
          onRetry={retry}
          onRecheck={recheck}
          onViewContent={viewContent}
        />
      )}
    </Container>
  );
}
