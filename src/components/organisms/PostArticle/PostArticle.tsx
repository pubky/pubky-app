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
}

export const PostArticle = ({ content, attachments, localAttachments, className }: PostArticleProps) => {
  const { title, body, coverImage } = usePostArticle({
    content,
    attachments,
    coverImageVariant: FileVariant.FEED,
  });

  const { dialogOpen, setDialogOpen, clickedLink, handleLinkClick } = useLinkConfirmation();

  const localCoverImage = localAttachments?.[0]?.type.startsWith('image')
    ? { src: localAttachments[0].urls.main, alt: localAttachments[0].name }
    : null;

  const finalCoverImage = localCoverImage || coverImage;

  return (
    <>
      <Container className={cn('justify-between gap-6 lg:flex-row @max-xl/grid:flex-col!', className)}>
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
            className="aspect-video h-auto w-full rounded-md object-cover object-center lg:aspect-auto lg:h-25 lg:w-45 @max-xl/grid:aspect-video! @max-xl/grid:h-auto! @max-xl/grid:w-full!"
            width={180}
            height={100}
          />
        )}
      </Container>

      <DialogCheckLink open={dialogOpen} onOpenChangeAction={setDialogOpen} linkUrl={clickedLink} />
    </>
  );
};
