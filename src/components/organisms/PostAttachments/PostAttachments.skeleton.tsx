import { Container } from '@/atoms/Container/Container';
import { Skeleton } from '@/atoms/Skeleton/Skeleton';
import { cn } from '@/libs/utils/utils';
import { MEDIA_GRID_CLASS } from '@/molecules/PostAttachmentsImagesAndVideos/PostAttachmentsImagesAndVideos';
import { categorizeAttachments } from './PostAttachments.helpers';
import type { PendingAttachment } from './PostAttachments.types';

/** A single tile loads at its natural height, which no skeleton can know; the fixed tile height is the grid's. */
export function PostAttachmentsSkeleton({
  attachments,
  className,
}: {
  attachments: PendingAttachment[];
  className?: string;
}) {
  const { imagesAndVideos, audios, genericFiles } = categorizeAttachments(attachments);

  return (
    <Container className={cn('gap-3', className)} data-testid="post-attachments-skeleton">
      {imagesAndVideos.length > 0 && (
        <Container display="grid" className={MEDIA_GRID_CLASS}>
          {imagesAndVideos.map(({ slot }) => (
            <Skeleton key={slot} className="h-52 w-full rounded-md sm:last:odd:col-span-2" />
          ))}
        </Container>
      )}
      {[...audios, ...genericFiles].map(({ slot }) => (
        <Skeleton key={slot} className="h-14 w-full rounded-md" />
      ))}
    </Container>
  );
}
