'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/atoms/Button/Button';
import { Image } from '@/atoms/Image/Image';
import { Video } from '@/atoms/Video/Video';
import { FileController } from '@/controllers/file/file';
import { usePostDetails } from '@/hooks/usePostDetails/usePostDetails';
import { cn } from '@/libs/utils/utils';
import { PostAttachmentsImagesAndVideos } from '@/molecules/PostAttachmentsImagesAndVideos/PostAttachmentsImagesAndVideos';
import {
  categorizeAttachments,
  splitAttachmentsByMediaType,
} from '@/organisms/PostAttachments/PostAttachments.helpers';
import type { AttachmentConstructed } from '@/organisms/PostAttachments/PostAttachments.types';
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
        if (!cancelled) {
          setMediaItems(categorizeAttachments(localAttachments).imagesAndVideos);
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

        setMediaItems(splitAttachmentsByMediaType(metadata).imagesAndVideos);
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

  const previewIndex = mediaItems.findIndex(
    (media) => media.type.startsWith('image') || media.type.startsWith('video'),
  );
  const previewMedia = previewIndex === -1 ? undefined : mediaItems[previewIndex];
  const isVideoPreview = previewMedia?.type.startsWith('video') ?? false;
  const previewSrc = isVideoPreview
    ? previewMedia?.urls.main
    : previewMedia?.type === 'image/gif'
      ? previewMedia.urls.main
      : (previewMedia?.urls.feed ?? previewMedia?.urls.main);

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
          aria-label="Open media preview"
          className={cn('relative shrink-0 cursor-pointer overflow-hidden', className)}
          onClick={(event) => {
            onClick?.(event);
            openPreview(previewIndex, event);
          }}
        >
          {isVideoPreview ? (
            <Video
              src={previewSrc}
              controls={false}
              muted
              playsInline
              pauseVideo
              className="pointer-events-none h-full w-full object-cover"
            />
          ) : (
            <Image src={previewSrc} alt="" fill className="object-cover" sizes="71px" />
          )}
        </Button>
      )}
    />
  );
}
