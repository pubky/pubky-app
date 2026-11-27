'use client';

import { Network, UserRound } from 'lucide-react';
import { Button } from '@/atoms/Button/Button';
import { useRequireAuth } from '@/hooks/useRequireAuth/useRequireAuth';
import { IllustratedEmptyState } from '../IllustratedEmptyState/IllustratedEmptyState';

interface LocalIndexFeedEmptyProps {
  /**
   * `first-sync` while the local index still reads the user's network for the first time; `signed-out` for a visitor,
   * whose index has no network to build a feed from.
   */
  reason: 'first-sync' | 'signed-out';
}

/**
 * LocalIndexFeedEmpty
 *
 * What a feed answered by the local index shows instead of looking empty: the network still loading, or a prompt to
 * join for a visitor.
 */
export function LocalIndexFeedEmpty({ reason }: LocalIndexFeedEmptyProps) {
  const { requireAuth } = useRequireAuth();

  if (reason === 'first-sync') {
    return (
      <IllustratedEmptyState
        imageSrc="/images/posts-replies-empty-state.webp"
        imageAlt="Feed - Loading your network"
        icon={Network}
        title={'Loading your network'}
        subtitle={'Posts appear here as the homeservers of the people you follow are read.'}
        dataCy="local-index-first-sync"
      />
    );
  }

  return (
    <IllustratedEmptyState
      imageSrc="/images/posts-replies-empty-state.webp"
      imageAlt="Feed - Sign in to see your network"
      icon={UserRound}
      title={'Sign in to see your feed'}
      subtitle={'This app builds feeds from the people you follow. Shared posts and profiles open without an account.'}
      dataCy="local-index-signed-out"
    >
      <Button onClick={() => requireAuth(() => undefined)}>{'Join Pubky'}</Button>
    </IllustratedEmptyState>
  );
}
