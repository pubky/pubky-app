'use client';

import { Loader2, Repeat } from 'lucide-react';
import type { MouseEvent } from 'react';
import { Button } from '@/atoms/Button/Button';
import { Container } from '@/atoms/Container/Container';
import { Typography } from '@/atoms/Typography/Typography';
import { PostHeaderTimestamp } from '@/molecules/PostHeaderTimestamp/PostHeaderTimestamp';

interface RepostHeaderProps {
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
      className="flex items-center gap-3 rounded-t-md bg-muted px-4 py-3"
      overrideDefaults
      data-testid="repost-header"
    >
      <Repeat className="size-5" aria-label="Repeat" />
      <Typography as="span" className="text-base font-bold text-foreground" overrideDefaults>
        {isCollectionShare ? 'You shared this' : 'You reposted'}
      </Typography>
      <Button
        type="button"
        variant="secondary"
        size="sm"
        disabled={isUndoing}
        aria-busy={isUndoing}
        onClick={handleUndo}
        onAuxClick={(event) => event.stopPropagation()}
        data-cy="repost-undo-btn"
        className="gap-2 border-card bg-card text-xs text-foreground hover:bg-card/90"
      >
        {isUndoing ? <Loader2 aria-hidden="true" className="animate-spin" /> : null}
        {'Undo'}
      </Button>
      {timeAgo && (
        <Container className="ml-auto" overrideDefaults>
          <PostHeaderTimestamp timeAgo={timeAgo} indexedAt={indexedAt} />
        </Container>
      )}
    </Container>
  );
}
