'use client';

import { PostController } from '@/controllers/post/post';
import { useLocalFirstQuery } from '@/hooks/useLocalFirstQuery/useLocalFirstQuery';
import { useAuthStore } from '@/stores/auth/auth.store';

type AuthoredCollections = NonNullable<Awaited<ReturnType<typeof PostController.getAuthoredCollections>>>;

type UseAuthoredCollectionsResult = {
  collections: AuthoredCollections;
  isLoading: boolean;
};

export function useAuthoredCollections(enabled = true): UseAuthoredCollectionsResult {
  const currentUserPubky = useAuthStore((state) => state.currentUserPubky);

  const { data, isLoading } = useLocalFirstQuery<AuthoredCollections>({
    queryFn: () => PostController.getAuthoredCollections({ authorId: currentUserPubky! }),
    fetchFn: () => PostController.fetchAuthoredCollections({ authorId: currentUserPubky!, viewerId: currentUserPubky }),
    deps: [currentUserPubky],
    enabled: enabled && !!currentUserPubky,
  });

  return {
    collections: data ?? [],
    isLoading,
  };
}
