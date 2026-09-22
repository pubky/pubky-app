'use client';

import { Newspaper } from 'lucide-react';
import { Container } from '@/atoms/Container/Container';
import { Image } from '@/atoms/Image/Image';
import { Typography } from '@/atoms/Typography/Typography';
import { useLinkConfirmation } from '@/hooks/useLinkConfirmation/useLinkConfirmation';
import { usePostArticle } from '@/hooks/usePostArticle/usePostArticle';
import { cn } from '@/libs/utils/utils';
import type { PostDetailsModel } from '@/models/post/details/postDetails';
import { PostText } from '@/molecules/PostText/PostText';
import { FileVariant } from '@/services/nexus/file/file.types';
import { DialogCheckLink } from '../DialogCheckLink/DialogCheckLink';
import type { AttachmentConstructed } from '../PostAttachments/PostAttachments.types';

interface PostArticleProps {
  content: string;
  attachments: PostDetailsModel['attachments'];
  localAttachments: AttachmentConstructed[] | undefined;
  className?: string;
  presentation?: 'default' | 'masonry';
}

export const PostArticle = ({
  content,
  attachments,
  localAttachments,
  className,
  presentation = 'default',
}: PostArticleProps) => {
  const { title, body, coverImage, hasCover } = usePostArticle({
    content,
    attachments,
    coverImageVariant: FileVariant.FEED,
  });

  const { dialogOpen, setDialogOpen, clickedLink, handleLinkClick } = useLinkConfirmation();

  // Local entries are index-aligned with attachments; slot 0 is the cover
  // only when the slot-0 rule says so (otherwise it's an inline image).
  const localCoverImage =
    hasCover && localAttachments?.[0]?.type.startsWith('image')
      ? {
          src: localAttachments[0].urls.main,
          alt: localAttachments[0].name,
          width: localAttachments[0].width,
          height: localAttachments[0].height,
        }
      : null;

  const finalCoverImage = localCoverImage || coverImage;

  return (
    <>
      <Container
        className={cn(
          presentation === 'masonry' ? 'gap-3' : 'justify-between gap-6 lg:flex-row @max-xl/grid:flex-col!',
          className,
        )}
      >
        <Container className="gap-y-1">
          <Container className="flex-row items-start gap-2">
            <Newspaper aria-hidden="true" className="mt-1 size-5 shrink-0" />
            <Typography size="lg" className="min-w-0 text-xl wrap-anywhere">
              {title}
            </Typography>
          </Container>

          <PostText content={body} isArticle onLinkClick={handleLinkClick} className="line-clamp-3" />
        </Container>

        {finalCoverImage && (
          <Image
            src={finalCoverImage.src}
            alt={finalCoverImage.alt}
            className={
              presentation === 'masonry'
                ? 'order-first -mx-4 h-auto max-h-160 w-auto max-w-none object-contain'
                : 'aspect-video h-auto w-full rounded-md object-cover object-center lg:aspect-auto lg:h-25 lg:w-45 @max-xl/grid:aspect-video! @max-xl/grid:h-auto! @max-xl/grid:w-full!'
            }
            width={presentation === 'masonry' ? finalCoverImage.width : 180}
            height={presentation === 'masonry' ? finalCoverImage.height : 100}
          />
        )}
      </Container>

      <DialogCheckLink open={dialogOpen} onOpenChangeAction={setDialogOpen} linkUrl={clickedLink} />
    </>
  );
};
