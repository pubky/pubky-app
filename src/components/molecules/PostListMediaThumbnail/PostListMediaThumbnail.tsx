'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/atoms/Button/Button';
import { Image } from '@/atoms/Image/Image';
import { FileController } from '@/controllers/file/file';
import { usePostDetails } from '@/hooks/usePostDetails/usePostDetails';
import { cn } from '@/libs/utils/utils';
import { PostAttachmentsImagesAndVideos } from '@/molecules/PostAttachmentsImagesAndVideos/PostAttachmentsImagesAndVideos';
import type { AttachmentConstructed } from '@/organisms/PostAttachments/PostAttachments.types';
import { FileVariant } from '@/services/nexus/file/file.types';
import { useLocalFilesStore } from '@/stores/localFiles/localFiles.store';

interface PostListMediaThumbnailProps {
  postId: string;
  className?: string;
  onClick?: (event: React.MouseEvent) => void;
}

export function PostListMediaThumbnail({ postId, className, onClick }: PostListMediaThumbnailProps) {
  const { postDetails } = usePostDetails(postId);
  const localAttachments = useLocalFilesStore((state) => state.posts[postId]);
  const [mediaItems, setMediaItems] = useState<AttachmentConstructed[]>([]);

  useEffect(() => {
    let cancelled = false;

    const resolveMedia = async () => {
      if (localAttachments) {
        const localMediaItems = localAttachments.filter(
          (file) => file.type.startsWith('image') || file.type.startsWith('video'),
        );

        if (!cancelled) {
          setMediaItems(localMediaItems);
        }
        return;
      }

      if (!postDetails?.attachments?.length) {
        if (!cancelled) {
          setMediaItems([]);
        }
        return;
      }

      try {
        const metadata = await FileController.getMetadata({ fileAttachments: postDetails.attachments });
        if (cancelled) return;

        const remoteMediaItems = metadata.flatMap((attachment): AttachmentConstructed[] => {
          const isImage = attachment.content_type.startsWith('image/');
          const isVideo = attachment.content_type.startsWith('video/');

          if (!isImage && !isVideo) {
            return [];
          }

          return [
            {
              type: attachment.content_type,
              name: attachment.name,
              urls: {
                main: FileController.getFileUrl({ fileId: attachment.id, variant: FileVariant.MAIN }),
                feed: isImage
                  ? FileController.getFileUrl({ fileId: attachment.id, variant: FileVariant.FEED })
                  : undefined,
              },
            },
          ];
        });

        setMediaItems(remoteMediaItems);
      } catch {
        if (!cancelled) {
          setMediaItems([]);
        }
      }
    };

    void resolveMedia();

    return () => {
      cancelled = true;
    };
  }, [localAttachments, postDetails?.attachments]);

  const previewIndex = mediaItems.findIndex((media) => media.type.startsWith('image'));
  const previewMedia = previewIndex === -1 ? undefined : mediaItems[previewIndex];
  const previewSrc =
    previewMedia?.type === 'image/gif' ? previewMedia.urls.main : (previewMedia?.urls.feed ?? previewMedia?.urls.main);

  if (!previewSrc) {
    return null;
  }

  return (
    <PostAttachmentsImagesAndVideos
      imagesAndVideos={mediaItems}
      renderTrigger={({ openPreview }) => (
        <Button
          overrideDefaults
          type="button"
          aria-label="Open image preview"
          className={cn('relative shrink-0 cursor-pointer overflow-hidden', className)}
          onClick={(event) => {
            onClick?.(event);
            openPreview(previewIndex, event);
          }}
        >
          <Image src={previewSrc} alt="" fill className="object-cover" sizes="71px" />
        </Button>
      )}
    />
  );
}
