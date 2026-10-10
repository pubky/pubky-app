'use client';

import { Newspaper } from 'lucide-react';
import { Container } from '@/atoms/Container/Container';
import { Image } from '@/atoms/Image/Image';
import { Skeleton } from '@/atoms/Skeleton/Skeleton';
import { Typography } from '@/atoms/Typography/Typography';
import { POST_CONTENT_PENDING_PROPS } from '@/hooks/useCardsLayout/useCardsLayout.utils';
import { useLinkConfirmation } from '@/hooks/useLinkConfirmation/useLinkConfirmation';
import { usePostArticle } from '@/hooks/usePostArticle/usePostArticle';
import { getAttachmentAtSlot } from '@/libs/utils/unlockedMedia';
import { cn } from '@/libs/utils/utils';
import type { PostDetailsModel } from '@/models/post/details/postDetails';
import { PostText } from '@/molecules/PostText/PostText';
import { FileVariant } from '@/services/nexus/file/file.types';
import { DialogCheckLink } from '../DialogCheckLink/DialogCheckLink';
import type { AttachmentConstructed, PendingAttachment } from '../PostAttachments/PostAttachments.types';

interface PostArticleProps {
  content: string;
  attachments: PostDetailsModel['attachments'];
  localAttachments: AttachmentConstructed[] | undefined;
  className?: string;
  /** 'full' reads the whole article, as the post page does; 'preview' clamps it to a card. */
  variant?: 'preview' | 'full';
  presentation?: 'default' | 'cards';
  /** Unlocked content whose bytes are still downloading: a skeleton stands in for the cover and each body image. */
  pendingAttachments?: PendingAttachment[];
}

/** The preview card's cover beside the text; the skeleton takes the same box. */
const PREVIEW_COVER_CLASS =
  'aspect-video h-auto w-full rounded-md object-cover object-center lg:aspect-auto lg:h-25 lg:w-45 @max-xl/grid:aspect-video! @max-xl/grid:h-auto! @max-xl/grid:w-full!';

export const PostArticle = ({
  content,
  attachments,
  localAttachments,
  className,
  variant = 'preview',
  presentation = 'default',
  pendingAttachments = [],
}: PostArticleProps) => {
  const isFull = variant === 'full';
  const { title, body, coverImage, hasCover, isCoverLoading } = usePostArticle({
    content,
    attachments,
    coverImageVariant: FileVariant.FEED,
    // While the bytes download the local list is still empty; the pending list says what it will hold.
    localAttachmentCount: pendingAttachments.length || localAttachments?.length,
    // A pending slot 0 already knows its type too: a video there vetoes the cover before its bytes land
    localCoverType: (getAttachmentAtSlot(localAttachments, 0) ?? getAttachmentAtSlot(pendingAttachments, 0))?.type,
  });

  const { dialogOpen, setDialogOpen, clickedLink, handleLinkClick } = useLinkConfirmation();

  // Local entries are index-aligned with attachments; slot 0 is the cover
  // only when the slot-0 rule says so (otherwise it's an inline image).
  // TODO:[Locks] #2660 — the other half of the cover rule: the hook says a slot 0 exists, this says
  // whether it is an image, so a video in slot 0 reports a cover that never renders.
  const localCover = getAttachmentAtSlot(localAttachments, 0);
  const localCoverImage =
    hasCover && localCover?.type.startsWith('image')
      ? { src: localCover.urls.main, alt: localCover.name, width: localCover.width, height: localCover.height }
      : null;

  const finalCoverImage = localCoverImage || coverImage;
  // Same image-only rule as `localCoverImage`: a video in slot 0 never becomes a cover, so no skeleton for it.
  const isCoverPending =
    hasCover && !finalCoverImage && Boolean(getAttachmentAtSlot(pendingAttachments, 0)?.type.startsWith('image'));

  return (
    <>
      <Container
        className={cn(
          presentation === 'cards' ? 'gap-3' : 'justify-between gap-6',
          presentation !== 'cards' && !isFull && 'lg:flex-row @max-xl/grid:flex-col!',
          className,
        )}
      >
        {presentation === 'cards' && isCoverLoading && !localCoverImage && (
          <span hidden {...POST_CONTENT_PENDING_PROPS} />
        )}
        {/* A full read puts the cover above the title, the way the article page does; the preview
            card keeps it beside the text. */}
        {isFull && isCoverPending && <Skeleton className="mb-2 aspect-video w-full rounded-md" />}
        {isFull && finalCoverImage && (
          <Image
            src={finalCoverImage.src}
            alt={finalCoverImage.alt}
            className="mb-2 aspect-video w-full rounded-md object-cover object-center"
          />
        )}
        <Container className="gap-y-1">
          <Container className="flex-row items-start gap-2">
            <Newspaper aria-hidden="true" className="mt-1 size-5 shrink-0" />
            <Typography size="lg" className="min-w-0 text-xl wrap-anywhere">
              {title}
            </Typography>
          </Container>

          <PostText
            content={body}
            isArticle
            fullArticle={isFull}
            // Only unlocked content is read in full here.
            articleMedia={isFull && localAttachments ? { localAttachments, pendingAttachments } : undefined}
            onLinkClick={handleLinkClick}
            className={isFull ? undefined : 'line-clamp-3'}
          />
        </Container>

        {!isFull && presentation !== 'cards' && isCoverPending && (
          <Skeleton className={cn(PREVIEW_COVER_CLASS, 'shrink-0')} />
        )}
        {!isFull && finalCoverImage && (
          <Image
            src={finalCoverImage.src}
            alt={finalCoverImage.alt}
            className={
              presentation === 'cards'
                ? 'order-first -mx-6 h-auto max-h-160 w-auto max-w-none object-contain'
                : PREVIEW_COVER_CLASS
            }
            width={presentation === 'cards' ? finalCoverImage.width : 180}
            height={presentation === 'cards' ? finalCoverImage.height : 100}
          />
        )}
      </Container>

      <DialogCheckLink open={dialogOpen} onOpenChangeAction={setDialogOpen} linkUrl={clickedLink} />
    </>
  );
};
