'use client';

import { useTranslations } from 'next-intl';
import * as Atoms from '@/atoms';
import * as Molecules from '@/molecules';
import type { SearchRecentSectionProps } from './SearchRecentSection.types';

/**
 * SearchRecentSection
 *
 * Displays recent searches in one section with users and tags.
 * Shows "Recent searches" header with X to clear all.
 * Users displayed horizontally, tags displayed horizontally below.
 * Note: Data is already limited by parent component.
 */
import { X } from 'lucide-react';
export function SearchRecentSection({ users, tags, onUserClick, onTagClick, onClearAll }: SearchRecentSectionProps) {
  const t = useTranslations('search.recent');
  const hasItems = users.length > 0 || tags.length > 0;
  if (!hasItems) {
    return null;
  }
  return (
    <Atoms.Container overrideDefaults className="flex flex-col gap-3">
      <Atoms.Container overrideDefaults className="flex items-center gap-2">
        <Atoms.Typography size="xs" className="tracking-widest text-muted-foreground uppercase">
          {t('title')}
        </Atoms.Typography>
        {onClearAll && (
          <Atoms.Button
            overrideDefaults
            className="flex cursor-pointer items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
            onClick={onClearAll}
            data-testid="clear-all-button"
            aria-label={t('clearAll')}
          >
            <X className="size-4" strokeWidth={2} aria-hidden="true" />
          </Atoms.Button>
        )}
      </Atoms.Container>

      {/* Recent users - horizontal */}
      {users.length > 0 && (
        <Atoms.Container overrideDefaults className="flex flex-wrap gap-2">
          {users.map((user) => (
            <Molecules.SearchRecentItem
              key={user.id}
              type={Molecules.RECENT_ITEM_TYPE.USER}
              user={user}
              onUserClick={onUserClick}
            />
          ))}
        </Atoms.Container>
      )}

      {/* Recent tags - horizontal */}
      {tags.length > 0 && (
        <Atoms.Container overrideDefaults className="flex flex-wrap gap-2">
          {tags.map((tag) => (
            <Molecules.SearchRecentItem
              key={tag.tag}
              type={Molecules.RECENT_ITEM_TYPE.TAG}
              tag={tag}
              onTagClick={onTagClick}
            />
          ))}
        </Atoms.Container>
      )}
    </Atoms.Container>
  );
}
