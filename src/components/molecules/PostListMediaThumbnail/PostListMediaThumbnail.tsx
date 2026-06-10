'use client';

import { useEffect, useState } from 'react';
import { Image } from '@/atoms/Image/Image';
import { FileController } from '@/controllers/file/file';
import { usePostDetails } from '@/hooks/usePostDetails/usePostDetails';
import { cn } from '@/libs/utils/utils';
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
  const [previewSrc, setPreviewSrc] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const resolvePreview = async () => {
      const localImage = localAttachments?.find((file) => file.type.startsWith('image'));
      if (localImage) {
        if (!cancelled) {
          setPreviewSrc(localImage.urls.feed ?? localImage.urls.main);
        }
        return;
      }

      if (!postDetails?.attachments?.length) {
        if (!cancelled) {
          setPreviewSrc(null);
        }
        return;
      }

      try {
        const metadata = await FileController.getMetadata({ fileAttachments: postDetails.attachments });
        if (cancelled) return;

        const firstImage = metadata.find((attachment) => attachment.content_type.startsWith('image/'));

        if (!firstImage) {
          if (!cancelled) {
            setPreviewSrc(null);
          }
          return;
        }

        setPreviewSrc(
          FileController.getFileUrl({
            fileId: firstImage.id,
            variant: FileVariant.FEED,
          }),
        );
      } catch {
        if (!cancelled) {
          setPreviewSrc(null);
        }
      }
    };

    void resolvePreview();

    return () => {
      cancelled = true;
    };
  }, [localAttachments, postDetails?.attachments]);

  if (!previewSrc) {
    return null;
  }

  return (
    <div className={cn('relative shrink-0 overflow-hidden', className)} onClick={onClick}>
      <Image src={previewSrc} alt="" fill className="object-cover" sizes="71px" />
    </div>
  );
}
