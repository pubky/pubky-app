'use client';
import { useEffect, useState } from 'react';
import { Container } from '@/atoms/Container/Container';
import { FileController } from '@/controllers/file/file';
import { usePauseMediaOutsideViewport } from '@/hooks/usePauseMediaOutsideViewport/usePauseMediaOutsideViewport';
import { PostAttachmentsAudios } from '@/molecules/PostAttachmentsAudios/PostAttachmentsAudios';
import { PostAttachmentsGenericFiles } from '@/molecules/PostAttachmentsGenericFiles/PostAttachmentsGenericFiles';
import { PostAttachmentsImagesAndVideos } from '@/molecules/PostAttachmentsImagesAndVideos/PostAttachmentsImagesAndVideos';
import { toast } from '@/molecules/Toaster/toast';
import { categorizeAttachments, splitAttachmentsByMediaType } from './PostAttachments.helpers';
import type { AttachmentConstructed, CategorizedAttachments, PostAttachmentsProps } from './PostAttachments.types';

export const PostAttachments = ({ attachments, localAttachments, mediaVariant = 'default' }: PostAttachmentsProps) => {
  const mediaContainerRef = usePauseMediaOutsideViewport();
  const [imagesAndVideos, setImagesAndVideos] = useState<AttachmentConstructed[]>([]);
  const [audios, setAudios] = useState<AttachmentConstructed[]>([]);
  const [genericFiles, setGenericFiles] = useState<AttachmentConstructed[]>([]);

  useEffect(() => {
    let cancelled = false;

    const applyCategorized = (categorized: CategorizedAttachments) => {
      setImagesAndVideos(categorized.imagesAndVideos);
      setAudios(categorized.audios);
      setGenericFiles(categorized.genericFiles);
    };

    const constructAttachments = async (fileAttachments: string[]) => {
      try {
        const result = await FileController.getMetadata({ fileAttachments });
        if (cancelled) return;

        applyCategorized(splitAttachmentsByMediaType(result));
      } catch {
        if (cancelled) return;

        // Clear on failure too — an edit can have changed the attachment set,
        // and keeping the previously constructed state would render stale media
        applyCategorized({ imagesAndVideos: [], audios: [], genericFiles: [] });
        toast({
          variant: 'error',
          description: 'Could not load attachments',
        });
      }
    };

    if (localAttachments?.length) {
      applyCategorized(categorizeAttachments(localAttachments));
    } else if (attachments?.length) {
      void constructAttachments(attachments);
    } else {
      // An edit can remove every attachment — clear previously constructed state
      applyCategorized({ imagesAndVideos: [], audios: [], genericFiles: [] });
    }

    return () => {
      cancelled = true;
    };
  }, [attachments, localAttachments]);

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
