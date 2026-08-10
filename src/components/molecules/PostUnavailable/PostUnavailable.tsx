'use client';

import { Loader2, X } from 'lucide-react';
import type { MouseEvent } from 'react';
import { Button } from '@/atoms/Button/Button';
import { CardContent } from '@/atoms/Card/Card';
import { Typography } from '@/atoms/Typography/Typography';
import { focusAdjacentGridItem } from '@/libs/utils/utils';

interface PostUnavailableProps {
  /** Already-translated status copy (e.g. deleted or not-found message). */
  message: string;
  onRemove?: () => void;
  isRemoving?: boolean;
  /** Cypress hook for the Remove button. Defaults to `post-unavailable-remove-btn`. */
  removeDataCy?: string;
}

/**
 * PostUnavailable
 *
 * Terminal card body when a post can't be shown normally — deleted tombstone or
 * settled Nexus 404. This IS the `CardContent`: render as a direct child of
 * `<Card>`, not nested inside another `CardContent`.
 *
 * Optional `onRemove` shows the collection/bookmarks Remove CTA; callers pass
 * distinct `removeDataCy` when E2E needs to tell deleted vs missing apart.
 */
export const PostUnavailable = ({
  message,
  onRemove,
  isRemoving = false,
  removeDataCy = 'post-unavailable-remove-btn',
}: PostUnavailableProps) => {
  const handleRemove = (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    focusAdjacentGridItem(event.currentTarget);
    onRemove?.();
  };

  return (
    <CardContent className="flex flex-1 flex-col items-center justify-center gap-3 py-2">
      <Typography size="sm" className="text-center font-normal text-muted-foreground">
        {message}
      </Typography>
      {onRemove ? (
        <Button
          type="button"
          variant="secondary"
          size="sm"
          disabled={isRemoving}
          aria-busy={isRemoving}
          onClick={handleRemove}
          onAuxClick={(event) => event.stopPropagation()}
          data-cy={removeDataCy}
        >
          {isRemoving ? <Loader2 aria-hidden="true" className="animate-spin" /> : <X aria-hidden="true" />}
          {'Remove'}
        </Button>
      ) : null}
    </CardContent>
  );
};
