'use client';

import { useState } from 'react';
import { Check, Lock } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Container } from '@/atoms/Container/Container';
import { LocksController } from '@/controllers/locks/locks';
import { useLockFile } from '@/hooks/useLockFile/useLockFile';
import { useUnlockedContent } from '@/hooks/useUnlockedContent/useUnlockedContent';
import { cn } from '@/libs/utils/utils';
import type { PostDetailsModel } from '@/models/post/details/postDetails';
import { DialogUnlockContent } from '@/molecules/DialogUnlockContent/DialogUnlockContent';
import { LockedPostCard } from '@/molecules/LockedPostCard/LockedPostCard';
import { useToast } from '@/molecules/Toaster/use-toast';
import type { AttachmentConstructed } from '@/organisms/PostAttachments/PostAttachments.types';
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
  const [isUnlocking, setIsUnlocking] = useState(false);
  const [unlockError, setUnlockError] = useState(false);
  const lockContent = LocksController.getLockContent(content);
  const { lockFile } = useLockFile(lock);
  const { unlockedPost, applyUnlockedContent, media, isOwnLock } = useUnlockedContent({ lock, lockFile, authorId });
  const { toast } = useToast();
  const tToast = useTranslations('toast.post');
  const tLock = useTranslations('post.lock');

  // TODO:[Locks] #1998 — `lockContent` is null when the teaser content can't be parsed. Rendering
  // nothing matches the previous behaviour; the unparseable-lock UX is still undecided.
  if (!lockContent) return null;

  const handleViewContent = async (password: string) => {
    if (!lockFile || !lock) return;
    setIsUnlocking(true);
    setUnlockError(false);
    try {
      const { credential } = await LocksController.unlock({ lockFile, lockUrl: lock, password });
      // Throws (caught below → error shown, dialog stays open) if the guarded post is unparseable.
      const content = await LocksController.fetchUnlockedContent({ lockFile, credential });
      setIsUnlockOpen(false);

      applyUnlockedContent(content); // renders + replicates into the reader's /priv
      // A dropped attachment is a permanent data error already reported to Sentry. Warn the reader
      // with a toast, but keep rendering the rest of the post — don't block the unlocked view.
      if (content.attachments.length < (content.post.attachments?.length ?? 0)) {
        toast({ variant: 'error', description: tToast('attachmentsLoadFailed') });
      }
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
          {isOwnLock && <LockedPostCard title={lockContent.lock_title} />}
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
                {isOwnLock ? tLock('myLockedContent') : tLock('unlocked')}
              </span>
            </div>
            <PostBody
              content={unlockedPost.content}
              attachments={null}
              localAttachments={media}
              textClassName={textClassName}
            />
          </div>
        </>
      ) : (
        // No lock file (still loading, or its fetch failed) → nothing to unlock against.
        <LockedPostCard
          title={lockContent.lock_title}
          unlockOpen={isUnlockOpen}
          onUnlock={
            !lockFile
              ? undefined
              : () => {
                  setUnlockError(false); // clear a prior failure so reopening starts clean
                  setIsUnlockOpen(true);
                }
          }
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
    </Container>
  );
}
