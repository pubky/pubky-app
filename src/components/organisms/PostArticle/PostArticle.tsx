'use client';

import { useLinkConfirmation } from '@/hooks/useLinkConfirmation/useLinkConfirmation';
import { usePostArticle } from '@/hooks/usePostArticle/usePostArticle';
import type { AttachmentConstructed } from '../PostAttachments/PostAttachments.types';
import { Container } from '@/atoms/Container/Container';
import { Image } from '@/atoms/Image/Image';
import { Typography } from '@/atoms/Typography/Typography';
import { PostText } from '@/molecules/PostText/PostText';
import { DialogCheckLink } from '../DialogCheckLink/DialogCheckLink';

import { cn } from '@/libs/utils/utils';
import type { PostDetailsModel } from '@/models/post/details/postDetails';
import { FileVariant } from '@/services/nexus/file/file.types';
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
      <Container className={cn('justify-between gap-6 lg:flex-row', className)}>
        <Container className="gap-y-1">
          <Typography size="lg" className="wrap-anywhere hyphens-auto">
            {title}
          </Typography>

          <PostText content={body} isArticle onLinkClick={handleLinkClick} className="text-muted-foreground" />
        </Container>

        {finalCoverImage && (
          <Image
            src={finalCoverImage.src}
            alt={finalCoverImage.alt}
            className="h-25 w-45 rounded-md object-cover object-center"
            width={180}
            height={100}
          />
        )}
      </Container>

      <DialogCheckLink open={dialogOpen} onOpenChangeAction={setDialogOpen} linkUrl={clickedLink} />
    </>
  );
};
