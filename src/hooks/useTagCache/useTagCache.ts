'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { TagCacheController } from '@/controllers/tag/tag-cache';
import { isAppError } from '@/libs/error/error.utils';
import { Logger } from '@/libs/logger/logger';
import { findTagMutation, getTagMembership } from '@/models/shared/tag/tag.utils';
import { toast } from '@/molecules/Toaster/toast';

/** Observe local data; mount only fills a missing record. TTL owns freshness. */
export function useTagCache(kind: 'post' | 'user', id: string | null | undefined, viewerId: string | null) {
  const key = `${kind}:${id ?? ''}:${viewerId ?? ''}`;
  const currentKey = useRef<string | null>(key);
  const pendingPage = useRef<string | null>(null);
  const [initial, setInitial] = useState<{ key: string; pending: boolean }>({ key, pending: !!id });
  const [loadingPage, setLoadingPage] = useState<string | null>(null);
  const observedRecord = useLiveQuery(async () => {
    if (!id) return null;
    try {
      const cached = await TagCacheController.get({ kind, id });
      if (!cached?.mutations) return cached;
      const now = Date.now();
      return {
        ...cached,
        mutations: Object.fromEntries(
          Object.entries(cached.mutations).filter(([, mutation]) => mutation.expiresAt > now),
        ),
      };
    } catch (error) {
      if (!isAppError(error)) Logger.warn('Could not read local tags', { error });
      return null;
    }
  }, [id, kind]);
  // Dexie keeps the previous result until the new query emits after an ID change.
  const cached = observedRecord && observedRecord.id !== id ? undefined : observedRecord;
  // Project during render so retained observations cannot show a previous viewer's selection.
  // The compiler skips this hook's try/finally; stable tags prevent avatar query resubscription loops.
  const record = useMemo(
    () =>
      cached
        ? {
            ...cached,
            tags: cached.tags.map((tag) => {
              const mutation = viewerId ? findTagMutation(cached, tag.label, viewerId) : undefined;
              const relationship = !viewerId
                ? false
                : mutation
                  ? mutation.relationship
                  : cached.cache?.viewerId === undefined
                    ? tag.relationship
                    : (getTagMembership(tag, viewerId, cached.cache.viewerId) ?? false);
              return { ...tag, relationship };
            }),
          }
        : cached,
    [cached, viewerId],
  );

  useEffect(() => {
    currentKey.current = key;
    let active = true;
    setInitial({ key, pending: !!id });
    if (id) {
      void TagCacheController.getOrFetch({ kind, id, viewerId: viewerId ?? undefined })
        .catch(() => {
          /* Retain local data offline; retry on revisit or a TTL tick. */
        })
        .finally(() => {
          if (active) setInitial({ key, pending: false });
        });
    }
    return () => {
      active = false;
      currentKey.current = null;
    };
  }, [kind, id, viewerId, key]);

  async function loadMore() {
    if (!id || pendingPage.current === key || record?.cache?.exhausted) return;
    pendingPage.current = key;
    setLoadingPage(key);
    try {
      await TagCacheController.getOrFetchNext({ kind, id, viewerId: viewerId ?? undefined });
    } catch {
      if (currentKey.current === key) toast({ variant: 'error', description: 'Could not load more tags' });
    } finally {
      if (pendingPage.current === key) pendingPage.current = null;
      setLoadingPage((previous) => (previous === key ? null : previous));
    }
  }

  return {
    record,
    isLoading: !!id && (record === undefined || (!record && (initial.key !== key || initial.pending))),
    isLoadingMore: loadingPage === key,
    loadMore,
  };
}
