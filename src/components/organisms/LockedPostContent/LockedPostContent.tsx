'use client';

import { useState } from 'react';
import { usePathname } from 'next/navigation';
import { Check, Lock } from 'lucide-react';
import { matchPostRoute } from '@/app/routes';
import { Container } from '@/atoms/Container/Container';
import { LocksController } from '@/controllers/locks/locks';
import { useLockFile } from '@/hooks/useLockFile/useLockFile';
import { usePayToUnlock } from '@/hooks/usePayToUnlock/usePayToUnlock';
import { usePurchasedLocks } from '@/hooks/usePurchasedLocks/usePurchasedLocks';
import { usePurchaseResume } from '@/hooks/usePurchaseResume/usePurchaseResume';
import { useRequireAuth } from '@/hooks/useRequireAuth/useRequireAuth';
import { useSessionNeedsUpgrade } from '@/hooks/useSessionNeedsUpgrade/useSessionNeedsUpgrade';
import { useUnlockedContent } from '@/hooks/useUnlockedContent/useUnlockedContent';
import { isArticleContent } from '@/libs/post/articleContent';
import { cn } from '@/libs/utils/utils';
import { parseCompositeId } from '@/models/models.utils';
import type { PostDetailsModel } from '@/models/post/details/postDetails';
import { DialogPayToUnlock } from '@/molecules/DialogPayToUnlock/DialogPayToUnlock';
import { LockedPostCard } from '@/molecules/LockedPostCard/LockedPostCard';
import { useIsNestedPostPreview } from '@/molecules/PostPreviewCard/PostPreviewNestingContext';
import { LocksPermissionNotice } from '@/organisms/LocksPermissionNotice/LocksPermissionNotice';
import type { AttachmentConstructed } from '@/organisms/PostAttachments/PostAttachments.types';
import { LockContentParser } from '@/pipes/locks/locks.parser';
import type { TUnlockedContent } from '@/services/locks/locks.types';
import { PostArticle } from '../PostArticle/PostArticle';
import { PostBody } from '../PostBody/PostBody';
import { PostContentBaseSkeleton } from '../PostContentBase/PostContentBase.skeleton';

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
  const { pubky: authorId, id: rawPostId } = parseCompositeId(postId);
  const isNestedPostPreview = useIsNestedPostPreview();
  const routeParams = matchPostRoute(usePathname());
  // Only the post the route names opens in full: the same page renders embeds and thread parents
  // through this component, and the reply/repost dialogs preview the focused post itself — which
  // matches the route ids, so the nesting flag is what keeps those compact.
  const isFocusedPostPage =
    routeParams?.userId === authorId && routeParams?.postId === rawPostId && !isNestedPostPreview;
  const lockContent = LocksController.getLockContent(content);
  const { lockFile, priceSats, isLoading: isLockFileLoading } = useLockFile(lock);
  const {
    unlockedPost,
    applyUnlockedContent,
    media,
    pendingAttachments,
    hasCompleteContent,
    isOwnLock,
    isResolvingOwn,
    isResolvingReplica,
  } = useUnlockedContent({ lock, lockFile, postId });
  const { requireAuth, isAuthenticated } = useRequireAuth();
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
  const { hasPurchase, markPurchased } = usePurchasedLocks({ enabled: priceSats !== null });
  const lockId = lock ? LockContentParser.lockIdFromUrl(lock) : null;
  usePurchaseResume({
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

  const {
    stage,
    isStalled,
    handshakePubky,
    connectionIssue,
    isConnectionPending,
    walletSetupNeeded,
    isSubmitting,
    retry,
    recheck,
    viewContent,
  } = usePayToUnlock({
    open: isPayOpen,
    lockUrl: lock ?? '',
    lockFile,
    onPurchased: markPurchased,
    onCompleted: showUnlockedContent,
  });

  if (!lockContent) return null;

  // Paying needs the reader's pubky (it is the payment-request delivery address), so a signed-out
  // reader gets the sign-in dialog instead. Unsupported legacy locks have no unlock handler, and
  // neither does the creator's own lock: it stays inert even if reading the original failed.
  const handleUnlock =
    priceSats && !showPermissionNotice && !isOwnLock ? () => requireAuth(() => setIsPayOpen(true)) : undefined;

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
          {isOwnLock && <LockedPostCard title={lockContent.lock_title} priceSats={priceSats} />}
          <div className="flex w-full flex-col gap-4">
            <div className="border-t border-border" />
            {/* Access indicator: the creator's own content vs. a lock the reader unlocked. */}
            <div className="flex items-center gap-1.5 text-brand">
              {isOwnLock ? (
                <Lock className="size-4 shrink-0" aria-hidden />
              ) : (
                <Check className="size-4 shrink-0" aria-hidden />
              )}
              <span className="text-xs leading-4 font-medium tracking-[1.2px] uppercase">
                {isOwnLock ? 'My locked content' : 'Unlocked'}
              </span>
            </div>
            {!unlockedPost ? (
              <PostContentBaseSkeleton />
            ) : unlockedPost.kind === 'long' && isArticleContent(unlockedPost.content) ? (
              <PostArticle
                content={unlockedPost.content}
                attachments={null}
                localAttachments={media}
                variant={isFocusedPostPage ? 'full' : 'preview'}
                pendingAttachments={pendingAttachments}
              />
            ) : (
              <PostBody
                content={unlockedPost.content}
                attachments={null}
                localAttachments={media}
                textClassName={textClassName}
                pendingAttachments={pendingAttachments}
              />
            )}
          </div>
        </>
      ) : (
        <>
          {showPermissionNotice && <LocksPermissionNotice />}
          <LockedPostCard
            title={lockContent.lock_title}
            priceSats={priceSats}
            isLoading={isLockFileLoading}
            unlockOpen={isPayOpen}
            onUnlock={handleUnlock}
            // A signed-out reader gets the sign-in dialog instead of the pay modal, and only a modal
            // closing snaps the button back.
            slideOnUnlock={isAuthenticated}
          />
        </>
      )}
      {priceSats && (
        <DialogPayToUnlock
          open={isPayOpen}
          onOpenChange={setIsPayOpen}
          lockTitle={lockContent.lock_title}
          authorId={authorId}
          priceSats={priceSats}
          stage={stage}
          isStalled={isStalled}
          handshakePubky={handshakePubky}
          connectionIssue={connectionIssue}
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
