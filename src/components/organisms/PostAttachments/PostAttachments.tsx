'use client';
import { Container } from '@/atoms/Container/Container';
import { useAttachmentsMetadata } from '@/hooks/useAttachmentsMetadata/useAttachmentsMetadata';
import { POST_CONTENT_PENDING_PROPS } from '@/hooks/useCardsLayout/useCardsLayout.utils';
import { usePauseMediaOutsideViewport } from '@/hooks/usePauseMediaOutsideViewport/usePauseMediaOutsideViewport';
import { cn } from '@/libs/utils/utils';
import { PostAttachmentsAudios } from '@/molecules/PostAttachmentsAudios/PostAttachmentsAudios';
import { PostAttachmentsGenericFiles } from '@/molecules/PostAttachmentsGenericFiles/PostAttachmentsGenericFiles';
import { PostAttachmentsImagesAndVideos } from '@/molecules/PostAttachmentsImagesAndVideos/PostAttachmentsImagesAndVideos';
import { PostMediaCarousel } from '@/molecules/PostMediaCarousel/PostMediaCarousel';
import { toast } from '@/molecules/Toaster/toast';
import { categorizeAttachments, splitAttachmentsByMediaType } from './PostAttachments.helpers';
import type { PostAttachmentsProps } from './PostAttachments.types';

export const PostAttachments = ({
  attachments,
  localAttachments,
  mediaVariant = 'default',
  className,
  children,
}: PostAttachmentsProps) => {
  const mediaContainerRef = usePauseMediaOutsideViewport();

  // Local (unsynced) attachments win over the published ones, and while they
  // exist there is nothing to resolve from the local file table.
  const { files, isLoading } = useAttachmentsMetadata({
    fileUris: attachments ?? [],
    enabled: !localAttachments?.length,
    onError: () => toast({ variant: 'error', description: 'Could not load attachments' }),
  });

  const { imagesAndVideos, audios, genericFiles } = localAttachments?.length
    ? categorizeAttachments(localAttachments)
    : splitAttachmentsByMediaType(files);

  const isContentPending = mediaVariant === 'cards' && isLoading;
  if (!imagesAndVideos.length && !audios.length && !genericFiles.length && !children && !isContentPending) return null;

  return (
    <Container
      ref={mediaVariant !== 'cards' || audios.length > 0 ? mediaContainerRef : undefined}
      className={cn(mediaVariant === 'cards' ? 'gap-6' : 'gap-3', className)}
    >
      {isContentPending && <span hidden {...POST_CONTENT_PENDING_PROPS} />}
      {imagesAndVideos.length ? (
        <PostAttachmentsImagesAndVideos
          imagesAndVideos={imagesAndVideos}
          {...(mediaVariant === 'list' ? { variant: mediaVariant } : {})}
          renderTrigger={
            mediaVariant === 'cards'
              ? ({ imagesAndVideos, openPreview, isPreviewOpen }) => (
                  <PostMediaCarousel
                    key={imagesAndVideos.map((media) => media.urls.main).join(',')}
                    media={imagesAndVideos}
                    onOpenPreview={openPreview}
                    isPreviewOpen={isPreviewOpen}
                  />
                )
              : undefined
          }
        />
      ) : null}
      {children}
      {audios.length ? <PostAttachmentsAudios audios={audios} /> : null}
      {genericFiles.length ? <PostAttachmentsGenericFiles genericFiles={genericFiles} /> : null}
    </Container>
  );
};
