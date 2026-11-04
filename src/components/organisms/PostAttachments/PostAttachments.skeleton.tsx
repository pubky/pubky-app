import { Container } from '@/atoms/Container/Container';
import { Skeleton } from '@/atoms/Skeleton/Skeleton';
import { cn } from '@/libs/utils/utils';
import {
  collapsedTileClass,
  MEDIA_GRID_CLASS,
} from '@/molecules/PostAttachmentsImagesAndVideos/PostAttachmentsImagesAndVideos';
import { categorizeAttachments } from './PostAttachments.helpers';
import type { PendingAttachment } from './PostAttachments.types';

/**
 * A single tile loads at its natural height, which no skeleton can know; the fixed tile height is the grid's.
 * With `collapseMedia` it takes the collapsed grid's shape (one row plus the toggle), so the feed does not jump.
 */
export function PostAttachmentsSkeleton({
  attachments,
  collapseMedia = false,
  className,
}: {
  attachments: PendingAttachment[];
  collapseMedia?: boolean;
  className?: string;
}) {
  const { imagesAndVideos, audios, genericFiles } = categorizeAttachments(attachments);
  const total = imagesAndVideos.length;
  const hasCollapseToggle = collapseMedia && total > 1;

  return (
    <Container className={cn('gap-3', className)} data-testid="post-attachments-skeleton">
      {imagesAndVideos.length > 0 && (
        <Container display="grid" className={MEDIA_GRID_CLASS}>
          {imagesAndVideos.map(({ slot }, index) => (
            <Skeleton
              key={slot}
              className={cn(
                'h-52 w-full rounded-md sm:last:odd:col-span-2',
                hasCollapseToggle && collapsedTileClass(index),
              )}
            />
          ))}
        </Container>
      )}
      {hasCollapseToggle && (
        <Skeleton className={cn('h-8 w-28 self-center rounded-full', total === 2 && 'sm:hidden')} />
      )}
      {[...audios, ...genericFiles].map(({ slot }) => (
        <Skeleton key={slot} className="h-14 w-full rounded-md" />
      ))}
    </Container>
  );
}
