'use client';

import { useLinkConfirmation } from '@/hooks/useLinkConfirmation/useLinkConfirmation';
import { usePostArticle } from '@/hooks/usePostArticle/usePostArticle';
import type { AttachmentConstructed } from '../PostAttachments/PostAttachments.types';
import * as Atoms from '@/atoms';
import * as Molecules from '@/molecules';
import * as Organisms from '@/organisms';
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
      <Atoms.Container className={cn('justify-between gap-6 lg:flex-row', className)}>
        <Atoms.Container className="gap-y-1">
          <Atoms.Typography size="lg" className="wrap-anywhere hyphens-auto">
            {title}
          </Atoms.Typography>

          <Molecules.PostText
            content={body}
            isArticle
            onLinkClick={handleLinkClick}
            className="text-muted-foreground"
          />
        </Atoms.Container>

        {finalCoverImage && (
          <Atoms.Image
            src={finalCoverImage.src}
            alt={finalCoverImage.alt}
            className="h-25 w-45 rounded-md object-cover object-center"
            width={180}
            height={100}
          />
        )}
      </Atoms.Container>

      <Organisms.DialogCheckLink open={dialogOpen} onOpenChangeAction={setDialogOpen} linkUrl={clickedLink} />
    </>
  );
};
