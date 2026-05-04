'use client';
import { Container } from '@/atoms/Container/Container';
import { PostAttachmentsAudios } from '@/molecules/PostAttachmentsAudios/PostAttachmentsAudios';
import { PostAttachmentsGenericFiles } from '@/molecules/PostAttachmentsGenericFiles/PostAttachmentsGenericFiles';
import { PostAttachmentsImagesAndVideos } from '@/molecules/PostAttachmentsImagesAndVideos/PostAttachmentsImagesAndVideos';
import { useToast } from '@/molecules/Toaster/use-toast';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import type { AttachmentConstructed, PostAttachmentsProps } from './PostAttachments.types';
import { FileController } from '@/controllers/file/file';
import { FileVariant } from '@/services/nexus/file/file.types';
export const PostAttachments = ({ attachments, localAttachments }: PostAttachmentsProps) => {
  const [imagesAndVideos, setImagesAndVideos] = useState<AttachmentConstructed[]>([]);
  const [audios, setAudios] = useState<AttachmentConstructed[]>([]);
  const [genericFiles, setGenericFiles] = useState<AttachmentConstructed[]>([]);

  const { toast } = useToast();
  const tToast = useTranslations('toast');
  const tPost = useTranslations('toast.post');

  useEffect(() => {
    const constructAttachments = async () => {
      if (!attachments?.length) return;

      try {
        const result = await FileController.getMetadata({ fileAttachments: attachments });

        const imagesAndVideos: AttachmentConstructed[] = [];
        const audios: AttachmentConstructed[] = [];
        const genericFiles: AttachmentConstructed[] = [];

        result.forEach((a) => {
          const { content_type, name, id } = a;

          const isImage = content_type.startsWith('image');
          const isVideo = content_type.startsWith('video');
          const isAudio = content_type.startsWith('audio');

          if (isImage || isVideo) {
            imagesAndVideos.push({
              type: content_type,
              name,
              urls: {
                main: FileController.getFileUrl({ fileId: id, variant: FileVariant.MAIN }),
                feed: isImage ? FileController.getFileUrl({ fileId: id, variant: FileVariant.FEED }) : undefined,
              },
            });
          } else if (isAudio) {
            audios.push({
              type: content_type,
              name,
              urls: { main: FileController.getFileUrl({ fileId: id, variant: FileVariant.MAIN }) },
            });
          } else {
            genericFiles.push({
              type: content_type,
              name,
              urls: { main: FileController.getFileUrl({ fileId: id, variant: FileVariant.MAIN }) },
            });
          }
        });

        setImagesAndVideos(imagesAndVideos);
        setAudios(audios);
        setGenericFiles(genericFiles);
      } catch {
        toast({
          title: tToast('error'),
          description: tPost('attachmentsLoadFailed'),
        });
      }
    };

    const constructLocalAttachments = () => {
      if (!localAttachments?.length) return;

      const imagesAndVideos: AttachmentConstructed[] = [];
      const audios: AttachmentConstructed[] = [];
      const genericFiles: AttachmentConstructed[] = [];

      localAttachments.forEach((a) => {
        const isImage = a.type.startsWith('image');
        const isVideo = a.type.startsWith('video');
        const isAudio = a.type.startsWith('audio');

        if (isImage || isVideo) {
          imagesAndVideos.push(a);
        } else if (isAudio) {
          audios.push(a);
        } else {
          genericFiles.push(a);
        }
      });

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
    <Container className="gap-3">
      {imagesAndVideos.length ? <PostAttachmentsImagesAndVideos imagesAndVideos={imagesAndVideos} /> : null}
      {audios.length ? <PostAttachmentsAudios audios={audios} /> : null}
      {genericFiles.length ? <PostAttachmentsGenericFiles genericFiles={genericFiles} /> : null}
    </Container>
  );
};
