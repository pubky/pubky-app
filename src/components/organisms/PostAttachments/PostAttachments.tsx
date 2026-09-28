'use client';
import { Container } from '@/atoms/Container/Container';
import { useAttachmentsMetadata } from '@/hooks/useAttachmentsMetadata/useAttachmentsMetadata';
import { usePauseMediaOutsideViewport } from '@/hooks/usePauseMediaOutsideViewport/usePauseMediaOutsideViewport';
import { PostAttachmentsAudios } from '@/molecules/PostAttachmentsAudios/PostAttachmentsAudios';
import { PostAttachmentsGenericFiles } from '@/molecules/PostAttachmentsGenericFiles/PostAttachmentsGenericFiles';
import { PostAttachmentsImagesAndVideos } from '@/molecules/PostAttachmentsImagesAndVideos/PostAttachmentsImagesAndVideos';
import { toast } from '@/molecules/Toaster/toast';
import { categorizeAttachments, splitAttachmentsByMediaType } from './PostAttachments.helpers';
import type { PostAttachmentsProps } from './PostAttachments.types';

export const PostAttachments = ({ attachments, localAttachments, mediaVariant = 'default' }: PostAttachmentsProps) => {
  const mediaContainerRef = usePauseMediaOutsideViewport();

  // Local (unsynced) attachments win over the published ones, and while they
  // exist there is nothing to resolve from the local file table.
  const { files } = useAttachmentsMetadata({
    fileUris: attachments ?? [],
    enabled: !localAttachments?.length,
    onError: () => toast({ variant: 'error', description: 'Could not load attachments' }),
  });

  const { imagesAndVideos, audios, genericFiles } = localAttachments?.length
    ? categorizeAttachments(localAttachments)
    : splitAttachmentsByMediaType(files);

  if (!imagesAndVideos.length && !audios.length && !genericFiles.length) return null;

  return (
    <Container ref={mediaContainerRef} className="gap-3">
      {imagesAndVideos.length ? (
        <PostAttachmentsImagesAndVideos
          imagesAndVideos={imagesAndVideos}
          {...(mediaVariant !== 'default' ? { variant: mediaVariant } : {})}
        />
      ) : null}
      {audios.length ? <PostAttachmentsAudios audios={audios} /> : null}
      {genericFiles.length ? <PostAttachmentsGenericFiles genericFiles={genericFiles} /> : null}
    </Container>
  );
};
