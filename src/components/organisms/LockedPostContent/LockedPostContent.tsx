'use client';

import { useState } from 'react';
import { Check, Lock } from 'lucide-react';
import type { TLockConfig } from '@/application/locks/locks.types';
import { Container } from '@/atoms/Container/Container';
import { LocksController } from '@/controllers/locks/locks';
import { useLockFile } from '@/hooks/useLockFile/useLockFile';
import { usePayToUnlock } from '@/hooks/usePayToUnlock/usePayToUnlock';
import { usePurchasedLocks } from '@/hooks/usePurchasedLocks/usePurchasedLocks';
import { usePurchaseResume } from '@/hooks/usePurchaseResume/usePurchaseResume';
import { useRequireAuth } from '@/hooks/useRequireAuth/useRequireAuth';
import { useUnlockedContent } from '@/hooks/useUnlockedContent/useUnlockedContent';
import { isArticleContent } from '@/libs/post/articleContent';
import { cn } from '@/libs/utils/utils';
import type { PostDetailsModel } from '@/models/post/details/postDetails';
import { DialogPayToUnlock } from '@/molecules/DialogPayToUnlock/DialogPayToUnlock';
import { DialogUnlockContent } from '@/molecules/DialogUnlockContent/DialogUnlockContent';
import { LockedPostCard } from '@/molecules/LockedPostCard/LockedPostCard';
import { useToast } from '@/molecules/Toaster/use-toast';
import type { AttachmentConstructed } from '@/organisms/PostAttachments/PostAttachments.types';
import { LockContentParser } from '@/pipes/locks/locks.parser';
import type { TUnlockedContent } from '@/services/locks/locks.types';
import { PostArticle } from '../PostArticle/PostArticle';
import { PostBody } from '../PostBody/PostBody';

interface LockedPostContentProps {
  content: string;
  lock: string | null | undefined;
  /** Post author (pubky.app account). Matches the signed-in user for a creator's own lock post. */
  authorId: string;
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
  authorId,
  attachments,
  localAttachments,
  className,
  textClassName,
}: LockedPostContentProps) {
  const [isUnlockOpen, setIsUnlockOpen] = useState(false);
  const [isPayOpen, setIsPayOpen] = useState(false);
  const [isUnlocking, setIsUnlocking] = useState(false);
  const [unlockError, setUnlockError] = useState(false);
  const lockContent = LocksController.getLockContent(content);
  const { lockFile, priceSats } = useLockFile(lock);
  // Null until the lock file lands, so the card never names an unlock method it cannot know yet.
  const unlockInfo: TLockConfig | null = !lockFile
    ? null
    : priceSats
      ? { method: 'payment', amountSats: priceSats }
      : { method: 'password' };
  const { unlockedPost, applyUnlockedContent, media, isOwnLock, isResolvingReplica } = useUnlockedContent({
    lock,
    lockFile,
    authorId,
  });
  const { toast } = useToast();
  const { requireAuth } = useRequireAuth();
  const isPaymentLock = unlockInfo?.method === 'payment';

  /** Renders unlocked content, closes whichever dialog produced it, and reports dropped media. */
  const showUnlockedContent = (unlocked: TUnlockedContent) => {
    setIsUnlockOpen(false);
    setIsPayOpen(false);

    applyUnlockedContent(unlocked); // renders + replicates into the reader's /priv
    // A dropped attachment is a permanent data error already reported to Sentry. Warn the reader
    // with a toast, but keep rendering the rest of the post — don't block the unlocked view.
    if (unlocked.attachments.length < (unlocked.post.attachments?.length ?? 0)) {
      toast({ variant: 'error', description: 'Could not load attachments' });
    }
  };

  // Paid but never received: the payment completed while the reader was away, so nothing on screen
  // would otherwise say so. Resolves itself, without the reader pressing anything.
  const { hasPurchase, markPurchased } = usePurchasedLocks({ enabled: isPaymentLock });
  const lockId = lock ? LockContentParser.lockIdFromUrl(lock) : null;
  usePurchaseResume({
    lock,
    lockFile,
    // The open modal owns status polling and completion. In particular, markPurchased must not
    // start a competing background finish immediately after a new payment is submitted.
    isPurchased: !isPayOpen && hasPurchase(lockId),
    hasContent: Boolean(unlockedPost),
    isResolvingContent: isResolvingReplica,
    onResumed: showUnlockedContent,
  });

  const { stage, isStalled, isSubmitting, submit, recheck, viewContent } = usePayToUnlock({
    open: isPayOpen,
    lockUrl: lock ?? '',
    lockFile,
    onPurchased: markPurchased,
    onCompleted: showUnlockedContent,
  });

  if (!lockContent) return null;

  // No lock file (still loading, or its fetch failed) → nothing to unlock against.
  const handleUnlock = !lockFile
    ? undefined
    : isPaymentLock
      ? // Paying needs the reader's pubky (it is the payment-request delivery address),
        // so a signed-out reader gets the sign-in dialog instead.
        () => requireAuth(() => setIsPayOpen(true))
      : () => {
          setUnlockError(false); // clear a prior failure so reopening starts clean
          setIsUnlockOpen(true);
        };

  // TODO:[Locks] #2369 — the password path (this handler + DialogUnlockContent below) goes away.
  const handleViewContent = async (password: string) => {
    if (!lockFile || !lock) return;
    setIsUnlocking(true);
    setUnlockError(false);
    try {
      const { credential } = await LocksController.unlock({ lockFile, lockUrl: lock, password });
      // Throws if the guarded post is unparseable; the catch below keeps the dialog open.
      showUnlockedContent(await LocksController.fetchUnlockedContent({ lockFile, credential }));
    } catch {
      setUnlockError(true); // already logged by the Err factory
    } finally {
      setIsUnlocking(false);
    }
  };

  return (
    <Container className={cn('min-w-0 gap-4', className)}>
      <PostBody
        content={lockContent.teaser_description}
        attachments={attachments ?? null}
        localAttachments={localAttachments}
        textClassName={textClassName}
      />
      {unlockedPost ? (
        <>
          {/* Own lock: keep the (now inert) lock card above the content so the price/terms stay visible. */}
          {isOwnLock && <LockedPostCard title={lockContent.lock_title} unlockInfo={unlockInfo} />}
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
            {unlockedPost.kind === 'long' && isArticleContent(unlockedPost.content) ? (
              <PostArticle content={unlockedPost.content} attachments={null} localAttachments={media} />
            ) : (
              <PostBody
                content={unlockedPost.content}
                attachments={null}
                localAttachments={media}
                textClassName={textClassName}
              />
            )}
          </div>
        </>
      ) : (
        <LockedPostCard
          title={lockContent.lock_title}
          unlockInfo={unlockInfo}
          unlockOpen={isUnlockOpen || isPayOpen}
          onUnlock={handleUnlock}
        />
      )}
      <DialogUnlockContent
        open={isUnlockOpen}
        onOpenChange={setIsUnlockOpen}
        lockTitle={lockContent.lock_title}
        onSubmit={handleViewContent}
        loading={isUnlocking}
        error={unlockError}
      />
      {isPaymentLock && priceSats && (
        <DialogPayToUnlock
          open={isPayOpen}
          onOpenChange={setIsPayOpen}
          lockTitle={lockContent.lock_title}
          authorId={authorId}
          priceSats={priceSats}
          stage={stage}
          isStalled={isStalled}
          isSubmitting={isSubmitting}
          onSubmit={submit}
          onRecheck={recheck}
          onViewContent={viewContent}
        />
      )}
    </Container>
  );
}
