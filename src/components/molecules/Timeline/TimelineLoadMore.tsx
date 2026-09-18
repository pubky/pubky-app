'use client';
import { Button, ButtonVariant } from '@/atoms/Button/Button';
import { Container } from '@/atoms/Container/Container';

interface TimelineLoadMoreProps {
  onLoadMore: () => void;
}

/**
 * TimelineLoadMore
 *
 * Manual continuation shown when automatic infinite scroll stalls: several rounds in a
 * row scanned the stream without surfacing a single new post (a long muted, deleted or
 * collection-only region), so the feed hands the next scan back to the user instead of
 * chaining loads to the end of the stream.
 */
export function TimelineLoadMore({ onLoadMore }: TimelineLoadMoreProps) {
  return (
    <Container className="flex items-center justify-center py-4">
      <Button variant={ButtonVariant.SECONDARY} type="button" onClick={onLoadMore} data-cy="timeline-load-more">
        {'Load more'}
      </Button>
    </Container>
  );
}
