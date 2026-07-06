'use client';

import { Button } from '@/atoms/Button/Button';
import { Image } from '@/atoms/Image/Image';
import { Video } from '@/atoms/Video/Video';
import { usePostAttachmentsMedia } from '@/hooks/usePostAttachmentsMedia/usePostAttachmentsMedia';
import { cn } from '@/libs/utils/utils';
import { PostAttachmentsImagesAndVideos } from '@/molecules/PostAttachmentsImagesAndVideos/PostAttachmentsImagesAndVideos';

interface PostListMediaThumbnailProps {
  postId: string;
}

export function PostListMediaThumbnail({ postId }: PostListMediaThumbnailProps) {
  const { mediaItems } = usePostAttachmentsMedia(postId);

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
          className={cn('relative shrink-0 cursor-pointer overflow-hidden', 'hidden h-10 w-[71px] rounded-sm md:block')}
          onClick={(event) => {
            event.stopPropagation();
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
