'use client';

import * as Core from '@/core';
import * as Atoms from '@/atoms';
import * as Molecules from '@/molecules';
import { useEffect, useState } from 'react';
import type { AttachmentConstructed, PostAttachmentsProps } from './PostAttachments.types';

export const PostAttachments = ({ attachments, localAttachments }: PostAttachmentsProps) => {
  const [imagesAndVideos, setImagesAndVideos] = useState<AttachmentConstructed[]>([]);
  const [audios, setAudios] = useState<AttachmentConstructed[]>([]);
  const [genericFiles, setGenericFiles] = useState<AttachmentConstructed[]>([]);

  const { toast } = Molecules.useToast();

  useEffect(() => {
    const constructAttachments = async () => {
      if (!attachments?.length) return;

      try {
        const result = await Core.FileController.getMetadata({ fileAttachments: attachments });

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
                main: Core.FileController.getFileUrl({ fileId: id, variant: Core.FileVariant.MAIN }),
                feed: isImage
                  ? Core.FileController.getFileUrl({ fileId: id, variant: Core.FileVariant.FEED })
                  : undefined,
              },
            });
          } else if (isAudio) {
            audios.push({
              type: content_type,
              name,
              urls: { main: Core.FileController.getFileUrl({ fileId: id, variant: Core.FileVariant.MAIN }) },
            });
          } else {
            genericFiles.push({
              type: content_type,
              name,
              urls: { main: Core.FileController.getFileUrl({ fileId: id, variant: Core.FileVariant.MAIN }) },
            });
          }
        });

        setImagesAndVideos(imagesAndVideos);
        setAudios(audios);
        setGenericFiles(genericFiles);
      } catch {
        toast({
          title: 'Error',
          description: 'Failed to load post attachments',
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
    <Atoms.Container className="gap-3">
      {imagesAndVideos.length ? <Molecules.PostAttachmentsImagesAndVideos imagesAndVideos={imagesAndVideos} /> : null}
      {audios.length ? <Molecules.PostAttachmentsAudios audios={audios} /> : null}
      {genericFiles.length ? <Molecules.PostAttachmentsGenericFiles genericFiles={genericFiles} /> : null}
    </Atoms.Container>
  );
};
