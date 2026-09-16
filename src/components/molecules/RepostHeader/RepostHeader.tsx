'use client';

import { Loader2, Repeat } from 'lucide-react';
import type { MouseEvent, ReactNode } from 'react';
import { Button } from '@/atoms/Button/Button';
import { Container } from '@/atoms/Container/Container';
import { Typography } from '@/atoms/Typography/Typography';
import { cn } from '@/libs/utils/utils';
import { PostHeaderTimestamp } from '@/molecules/PostHeaderTimestamp/PostHeaderTimestamp';

interface RepostHeaderProps {
  /** Entry-level actions when the flattened body has no action bar. */
  children?: ReactNode;
  /** True when the reposted (embedded) post is a collection — copy becomes "You shared this". */
  isCollectionShare?: boolean;
  /** Deletes the repost itself (the repost's own composite id). */
  onUndo: () => void;
  /** Disables the Undo button and shows a spinner while the delete is in flight. */
  isUndoing?: boolean;
  /** Relative share time (e.g. "12m") shown right-aligned; hidden when null. */
  timeAgo?: string | null;
  /** Exact share time for the timestamp tooltip. */
  indexedAt?: Date | null;
}

/**
 * RepostHeader
 *
 * Header bar displayed on top of reposts made by the current user.
 * Shows "You reposted" ("You shared this" for collection shares) with a repeat
 * icon, an Undo button that deletes the repost, and the share time on the right.
 * Only shown on simple reposts (no content) by current user.
 */
export function RepostHeader({
  children,
  isCollectionShare = false,
  onUndo,
  isUndoing = false,
  timeAgo = null,
  indexedAt = null,
}: RepostHeaderProps) {
  const handleUndo = (event: MouseEvent<HTMLButtonElement>) => {
    // The surrounding post card navigates on click/auxclick — keep Undo local.
    event.stopPropagation();
    event.preventDefault();
    onUndo();
  };

  return (
    <Container
      className={cn('flex items-center gap-3 rounded-t-md bg-muted px-6 py-3', children && 'flex-wrap')}
      overrideDefaults
      data-testid="repost-header"
    >
      <Repeat className="size-5" aria-label="Repeat" />
      <Typography as="span" className="text-base font-bold text-foreground" overrideDefaults>
        {isCollectionShare ? 'You shared this' : 'You reposted'}
      </Typography>
      <Button
        type="button"
        variant="dark"
        size="sm"
        disabled={isUndoing}
        aria-busy={isUndoing}
        onClick={handleUndo}
        onAuxClick={(event) => event.stopPropagation()}
        data-cy="repost-undo-btn"
        className="gap-2 px-3.5 text-xs font-bold"
      >
        {isUndoing ? <Loader2 aria-hidden="true" className="animate-spin" /> : null}
        {'Undo'}
      </Button>
      {children}
      {timeAgo && (
        <Container className="ml-auto" overrideDefaults>
          <PostHeaderTimestamp timeAgo={timeAgo} indexedAt={indexedAt} />
        </Container>
      )}
    </Container>
  );
}
