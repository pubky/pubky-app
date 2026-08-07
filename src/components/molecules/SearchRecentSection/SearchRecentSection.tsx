'use client';

/**
 * SearchRecentSection
 *
 * Displays recent searches in one section with users and tags.
 * Shows "Recent searches" header with X to clear all.
 * Users displayed horizontally, tags displayed horizontally below.
 * Note: Data is already limited by parent component.
 */
import { X } from 'lucide-react';
import { Button } from '@/atoms/Button/Button';
import { Container } from '@/atoms/Container/Container';
import { Typography } from '@/atoms/Typography/Typography';
import { SearchRecentItem } from '../SearchRecentItem/SearchRecentItem';
import { RECENT_ITEM_TYPE } from '../SearchRecentItem/SearchRecentItem.constants';
import type { SearchRecentSectionProps } from './SearchRecentSection.types';

export function SearchRecentSection({ users, tags, onUserClick, onTagClick, onClearAll }: SearchRecentSectionProps) {
  const hasItems = users.length > 0 || tags.length > 0;
  if (!hasItems) {
    return null;
  }
  return (
    <Container overrideDefaults className="flex flex-col gap-3">
      <Container overrideDefaults className="flex items-center gap-2">
        <Typography size="xs" className="tracking-widest text-muted-foreground uppercase">
          {'Recent searches'}
        </Typography>
        {onClearAll && (
          <Button
            overrideDefaults
            className="flex cursor-pointer items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
            onClick={onClearAll}
            data-testid="clear-all-button"
            aria-label={'Clear all recent searches'}
          >
            <X className="size-4" strokeWidth={2} aria-hidden="true" />
          </Button>
        )}
      </Container>

      {/* Recent users - horizontal */}
      {users.length > 0 && (
        <Container overrideDefaults className="flex flex-wrap gap-2">
          {users.map((user) => (
            <SearchRecentItem key={user.id} type={RECENT_ITEM_TYPE.USER} user={user} onUserClick={onUserClick} />
          ))}
        </Container>
      )}

      {/* Recent tags - horizontal */}
      {tags.length > 0 && (
        <Container overrideDefaults className="flex flex-wrap gap-2">
          {tags.map((tag) => (
            <SearchRecentItem key={tag.tag} type={RECENT_ITEM_TYPE.TAG} tag={tag} onTagClick={onTagClick} />
          ))}
        </Container>
      )}
    </Container>
  );
}
