'use client';

import type { PostDetailsModel } from '@/core';
import type { AttachmentConstructed } from '../PostAttachments/PostAttachments.types';
import * as Atoms from '@/atoms';
import * as Molecules from '@/molecules';
import * as Organisms from '@/organisms';
import * as Core from '@/core';
import * as Libs from '@/libs';
import * as Hooks from '@/hooks';

interface PostArticleProps {
  content: string;
  attachments: PostDetailsModel['attachments'];
  localAttachments: AttachmentConstructed[] | undefined;
  className?: string;
}

export const PostArticle = ({ content, attachments, localAttachments, className }: PostArticleProps) => {
  const { title, body, coverImage } = Hooks.usePostArticle({
    content,
    attachments,
    coverImageVariant: Core.FileVariant.FEED,
  });

  const { dialogOpen, setDialogOpen, clickedLink, handleLinkClick } = Hooks.useLinkConfirmation();

  const localCoverImage = localAttachments?.[0]?.type.startsWith('image')
    ? { src: localAttachments[0].urls.main, alt: localAttachments[0].name }
    : null;

  const finalCoverImage = localCoverImage || coverImage;

  return (
    <>
      <Atoms.Container className={Libs.cn('justify-between gap-6 lg:flex-row', className)}>
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
