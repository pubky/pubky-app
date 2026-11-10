'use client';

import { Newspaper } from 'lucide-react';
import { Container } from '@/atoms/Container/Container';
import { Image } from '@/atoms/Image/Image';
import { Skeleton } from '@/atoms/Skeleton/Skeleton';
import { Typography } from '@/atoms/Typography/Typography';
import { POST_CONTENT_PENDING_PROPS } from '@/hooks/useCardsLayout/useCardsLayout.utils';
import { useLinkConfirmation } from '@/hooks/useLinkConfirmation/useLinkConfirmation';
import { usePostArticle } from '@/hooks/usePostArticle/usePostArticle';
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
  presentation?: 'default' | 'cards';
  /** Unlocked content whose bytes are still downloading: a skeleton stands in for the cover. */
  pendingAttachments?: PendingAttachment[];
}

/** The preview card's cover beside the text; the skeleton takes the same box. */
const PREVIEW_COVER_CLASS =
  'aspect-video h-auto w-full rounded-md object-cover object-center lg:aspect-auto lg:h-25 lg:w-45 @max-xl/grid:aspect-video! @max-xl/grid:h-auto! @max-xl/grid:w-full!';

/** Also heads the profile's full read, which opens inside the card. */
export function PostArticleTitle({ title }: { title: string }) {
  return (
    <Container className="flex-row items-start gap-2">
      <Newspaper aria-hidden="true" className="mt-1 size-5 shrink-0" />
      <Typography size="lg" className="min-w-0 text-xl wrap-anywhere">
        {title}
      </Typography>
    </Container>
  );
}

export const PostArticle = ({
  content,
  attachments,
  localAttachments,
  className,
  presentation = 'default',
  pendingAttachments = [],
}: PostArticleProps) => {
  const { title, body, coverImage, isCoverPending, isCoverLoading } = usePostArticle({
    content,
    attachments,
    localAttachments,
    pendingAttachments,
    coverImageVariant: FileVariant.FEED,
  });

  const { dialogOpen, setDialogOpen, clickedLink, handleLinkClick } = useLinkConfirmation();

  return (
    <>
      <Container
        className={cn(
          presentation === 'cards' ? 'gap-3' : 'justify-between gap-6 lg:flex-row @max-xl/grid:flex-col!',
          className,
        )}
      >
        {presentation === 'cards' && isCoverLoading && <span hidden {...POST_CONTENT_PENDING_PROPS} />}
        <Container className="gap-y-1">
          <PostArticleTitle title={title} />
          <PostText content={body} isArticle onLinkClick={handleLinkClick} className="line-clamp-3" />
        </Container>

        {presentation !== 'cards' && isCoverPending && <Skeleton className={cn(PREVIEW_COVER_CLASS, 'shrink-0')} />}
        {coverImage && (
          <Image
            src={coverImage.src}
            alt={coverImage.alt}
            className={
              presentation === 'cards'
                ? 'order-first -mx-6 h-auto max-h-160 w-auto max-w-none object-contain'
                : PREVIEW_COVER_CLASS
            }
            width={presentation === 'cards' ? coverImage.width : 180}
            height={presentation === 'cards' ? coverImage.height : 100}
          />
        )}
      </Container>

      <DialogCheckLink open={dialogOpen} onOpenChangeAction={setDialogOpen} linkUrl={clickedLink} />
    </>
  );
};
