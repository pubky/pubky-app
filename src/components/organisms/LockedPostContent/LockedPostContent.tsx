'use client';

import { useEffect, useState } from 'react';
import { Check } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Container } from '@/atoms/Container/Container';
import type { AttachmentConstructed } from '@/components/organisms/PostAttachments/PostAttachments.types';
import { LocksController } from '@/controllers/locks/locks';
import { usePostLock } from '@/hooks/usePostLock/usePostLock';
import { cn } from '@/libs/utils/utils';
import type { PostDetailsModel } from '@/models/post/details/postDetails';
import { DialogUnlockContent } from '@/molecules/DialogUnlockContent/DialogUnlockContent';
import { LockedPostCard } from '@/molecules/LockedPostCard/LockedPostCard';
import { useToast } from '@/molecules/Toaster/use-toast';
import type { TUnlockedContent } from '@/services/locks/locks.types';
import { useAuthStore } from '@/stores/auth/auth.store';
import { PostBody } from '../PostBody/PostBody';

/** Guarded attachment bytes → object-URL media, matching the creator-preview `localAttachments` shape. */
const toLocalMedia = (attachments: TUnlockedContent['attachments']): AttachmentConstructed[] =>
  attachments.map(({ contentType, bytes }, index) => {
    // `bytes as BlobPart`: the SDK's `Uint8Array<ArrayBufferLike>` doesn't narrow to Blob's expected view.
    const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: contentType }));
    const isImage = contentType.startsWith('image');
    return { type: contentType, name: `attachment-${index}`, urls: { main: url, feed: isImage ? url : undefined } };
  });

interface LockedPostContentProps {
  content: string;
  lock: string | null | undefined;
  attachments?: PostDetailsModel['attachments'];
  /** Creator's local (not-yet-remote) attachments, so their own just-published media shows. */
  localAttachments?: AttachmentConstructed[];
  className?: string;
  textClassName?: string;
}

/**
 * Reader view of a lock post: teaser body + shared `LockedPostCard`, fed by `usePostLock`.
 * Its own component so the hook runs only for lock posts, not every post.
 */
export function LockedPostContent({
  content,
  lock,
  attachments,
  localAttachments,
  className,
  textClassName,
}: LockedPostContentProps) {
  const [isUnlockOpen, setIsUnlockOpen] = useState(false);
  const [isUnlocking, setIsUnlocking] = useState(false);
  const [unlockError, setUnlockError] = useState(false);
  const [unlockedContent, setUnlockedContent] = useState<TUnlockedContent | null>(null);
  const [media, setMedia] = useState<AttachmentConstructed[]>([]);
  const { lockContent, lockFile, hasError } = usePostLock({ content, lock });
  const currentUserPubky = useAuthStore((state) => state.currentUserPubky);
  const { toast } = useToast();
  const tToast = useTranslations('toast.post');
  const tLock = useTranslations('post.lock');

  // Already unlocked? Load the reader's replicated copy from their own `/priv` — no Lock Server round
  // trip, no re-entering the password. A missing marker just leaves the lock card in place.
  useEffect(() => {
    if (!lock || !currentUserPubky) return;
    let cancelled = false;
    LocksController.loadReplicatedContent({ lockUrl: lock, readerPubky: currentUserPubky })
      .then((replicated) => {
        if (!cancelled && replicated) setUnlockedContent(replicated);
      })
      .catch(() => undefined); // already reported by the Err factory; fall back to the lock card
    return () => {
      cancelled = true;
    };
  }, [lock, currentUserPubky]);

  // Object URLs are created here (browser-only) and revoked on change/unmount to avoid leaks.
  useEffect(() => {
    const built = unlockedContent ? toLocalMedia(unlockedContent.attachments) : [];
    setMedia(built);
    return () => built.forEach((m) => URL.revokeObjectURL(m.urls.main));
  }, [unlockedContent]);

  // TODO:[Locks] #1998 — `lockContent` is null when the teaser content can't be parsed. Rendering
  // nothing matches the previous behaviour; the unparseable-lock UX is still undecided.
  if (!lockContent) return null;

  const handleViewContent = async (password: string) => {
    if (!lockFile || !lock) return;
    setIsUnlocking(true);
    setUnlockError(false);
    try {
      const { credential } = await LocksController.unlock({ lockFile, lockUrl: lock, password });
      const content = await LocksController.fetchUnlockedContent({ lockFile, credential });
      setUnlockedContent(content);
      setIsUnlockOpen(false);
      // A dropped attachment is a permanent data error already reported to Sentry. Warn the reader
      // with a toast, but keep rendering the rest of the post — don't block the unlocked view.
      if (content && content.attachments.length < (content.post.attachments?.length ?? 0)) {
        toast({ variant: 'error', description: tToast('attachmentsLoadFailed') });
      }

      // Best-effort: the content already rendered, and a failed run writes no completion marker, so
      // the next unlock just retries. Errors are reported by the service's Err factory.
      if (content && currentUserPubky) {
        void LocksController.replicateUnlockedContent({ lockUrl: lock, readerPubky: currentUserPubky, content }).catch(
          () => undefined,
        );
      }
    } catch {
      setUnlockError(true); // already logged by the Err factory
    } finally {
      setIsUnlocking(false);
    }
  };

  return (
    <Container className={cn('min-w-0 gap-3', className)}>
      <PostBody
        content={lockContent.teaser_description}
        attachments={attachments ?? null}
        localAttachments={localAttachments}
        textClassName={textClassName}
      />
      {unlockedContent ? (
        <div className="flex w-full flex-col gap-4">
          <div className="border-t border-border" />
          {/* Mirrors the lock card's password indicator (Shield + mask), swapped to the unlocked state. */}
          <div className="flex items-center gap-1.5 text-brand">
            <Check className="size-4 shrink-0" aria-hidden />
            <span className="text-xs leading-4 font-medium tracking-[1.2px] uppercase">{tLock('unlocked')}</span>
          </div>
          <PostBody
            content={unlockedContent.post.content}
            attachments={null}
            localAttachments={media}
            textClassName={textClassName}
          />
        </div>
      ) : (
        // Unlock is disabled when the lock file could not be resolved (`hasError`) — nothing to unlock against.
        <LockedPostCard
          title={lockContent.lock_title}
          onUnlock={
            hasError
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
