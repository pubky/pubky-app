'use client';
import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Container } from '@/atoms/Container/Container';
import { FileController } from '@/controllers/file/file';
import { usePauseMediaOutsideViewport } from '@/hooks/usePauseMediaOutsideViewport/usePauseMediaOutsideViewport';
import { PostAttachmentsAudios } from '@/molecules/PostAttachmentsAudios/PostAttachmentsAudios';
import { PostAttachmentsGenericFiles } from '@/molecules/PostAttachmentsGenericFiles/PostAttachmentsGenericFiles';
import { PostAttachmentsImagesAndVideos } from '@/molecules/PostAttachmentsImagesAndVideos/PostAttachmentsImagesAndVideos';
import { useToast } from '@/molecules/Toaster/use-toast';
import { categorizeAttachments, splitAttachmentsByMediaType } from './PostAttachments.helpers';
import type { AttachmentConstructed, PostAttachmentsProps } from './PostAttachments.types';

export const PostAttachments = ({ attachments, localAttachments, mediaVariant = 'default' }: PostAttachmentsProps) => {
  const mediaContainerRef = usePauseMediaOutsideViewport();
  const [imagesAndVideos, setImagesAndVideos] = useState<AttachmentConstructed[]>([]);
  const [audios, setAudios] = useState<AttachmentConstructed[]>([]);
  const [genericFiles, setGenericFiles] = useState<AttachmentConstructed[]>([]);

  const { toast } = useToast();
  const tPost = useTranslations('toast.post');

  useEffect(() => {
    const constructAttachments = async () => {
      if (!attachments?.length) return;

      try {
        const result = await FileController.getMetadata({ fileAttachments: attachments });
        const { imagesAndVideos, audios, genericFiles } = splitAttachmentsByMediaType(result);

        setImagesAndVideos(imagesAndVideos);
        setAudios(audios);
        setGenericFiles(genericFiles);
      } catch {
        toast({
          variant: 'error',
          description: tPost('attachmentsLoadFailed'),
        });
      }
    };

    const constructLocalAttachments = () => {
      if (!localAttachments?.length) return;

      const { imagesAndVideos, audios, genericFiles } = categorizeAttachments(localAttachments);

      setImagesAndVideos(imagesAndVideos);
      setAudios(audios);
      setGenericFiles(genericFiles);
    };

    if (localAttachments) {
      constructLocalAttachments();
    } else {
      constructAttachments();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- toast is an external side-effect, not a dependency
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
