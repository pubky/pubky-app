'use client';

import { useEffect, useRef, useState } from 'react';
import { TagController } from '@/controllers/tag/tag';
import { useRequireAuth } from '@/hooks/useRequireAuth/useRequireAuth';
import { canonicalizeTagLabel } from '@/libs/utils/utils';
import { showTagWriteErrorToast } from '@/molecules/TaggedItem/TaggedItem.utils';
import { withResourceViewerTag } from '@/pipes/tag/tag.resource';
import type { NexusTag } from '@/services/nexus/nexus.types';
import { RESOURCE_TAGS_LIMIT } from '@/services/nexus/resource/resource.constants';
import { useAuthStore } from '@/stores/auth/auth.store';
import type { TResourceTagWriteResult, UseResourceTagsOptions, UseResourceTagsResult } from './useResourceTags.types';

/**
 * `isTruncated`: Nexus answered with as many labels as it is asked for, so the link may have more.
 * Taken from Nexus' answer, never from the list after the viewer's writes: removing a tag from a
 * full answer leaves a lower bound, not an exact count.
 */
type TSettled = { key: string; tags: NexusTag[]; isTruncated: boolean; isError: boolean };

/**
 * The tags people put on an external resource (a link of any scheme), read from Nexus by the link
 * exactly as written, with the viewer's own add and remove.
 *
 * Network only (no IndexedDB table holds web links): the controller's Nexus query is shared by
 * every reader of the same link and viewer, and each follows its changes, so a tag added on one
 * card shows on every other card of the link. A write shows at once, and stays once the homeserver
 * accepted it (the shared answer takes it too, since Nexus indexes the write with a delay); a
 * failed write is undone with an error toast. Signed out, the tags show and every write asks to
 * sign in first.
 *
 * @param uri - The link exactly as written; `null` reads nothing
 * @param options.enabled - `false` defers the read (still loading); writes work either way
 */
export function useResourceTags(
  uri: string | null,
  { enabled = true }: UseResourceTagsOptions = {},
): UseResourceTagsResult {
  const viewerId = useAuthStore((state) => state.currentUserPubky);
  const { waitForAuth } = useRequireAuth();
  const key = uri ? `${uri}\n${viewerId ?? ''}` : '';
  const [settled, setSettled] = useState<TSettled | null>(null);
  const pending = useRef(new Set<string>());

  useEffect(() => {
    if (!uri || !enabled) return;
    // Set by the cleanup when the link or viewer changes, so a late answer never replaces a newer one.
    let cancelled = false;
    // Another card of the same link (a post and its repost, the resource page) read or wrote: show
    // it here too. A write of this card's own in flight keeps its optimistic state until it settles.
    const unsubscribe = TagController.subscribeResourceTags({ uri, viewerId }, (tags) => {
      if (cancelled || pending.current.size > 0) return;
      // A write on another card changed the shared answer; a full answer it came from stays full.
      setSettled((state) => ({
        key,
        tags,
        isTruncated: tags.length >= RESOURCE_TAGS_LIMIT || (state?.key === key && state.isTruncated),
        isError: false,
      }));
    });
    TagController.fetchResourceTags({ uri, viewerId }).then(
      (tags) => {
        if (!cancelled) setSettled({ key, tags, isTruncated: tags.length >= RESOURCE_TAGS_LIMIT, isError: false });
      },
      () => {
        // The service already reported the failure through Err.*: the bar shows no tags.
        if (!cancelled) setSettled({ key, tags: [], isTruncated: false, isError: true });
      },
    );
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [uri, viewerId, key, enabled]);

  const current = settled?.key === key ? settled : null;

  const update = (label: string, taggerId: string, isAdded: boolean, tagUri?: string | null) =>
    setSettled((state) =>
      state?.key === key
        ? { ...state, tags: withResourceViewerTag(state.tags, { label, viewerId: taggerId, tagUri }, isAdded) }
        : state,
    );

  const setTagUri = (label: string, tagUri: string) =>
    setSettled((state) =>
      state?.key === key
        ? { ...state, tags: state.tags.map((tag) => (tag.label === label ? { ...tag, tag_uri: tagUri } : tag)) }
        : state,
    );

  const write = async (
    rawLabel: string,
    isAdded: boolean,
    tagUri?: string | null,
  ): Promise<TResourceTagWriteResult> => {
    const label = canonicalizeTagLabel(rawLabel);
    if (!uri || !label || pending.current.has(label)) return { success: false };
    pending.current.add(label);
    try {
      if (!(await waitForAuth(`resource-tag:${label}`))) return { success: false };
      const taggerId = useAuthStore.getState().currentUserPubky;
      if (!taggerId) return { success: false };

      update(label, taggerId, isAdded);
      try {
        if (isAdded) {
          const written = await TagController.commitCreateResource({ taggerId, uri, label });
          setTagUri(written.label, written.tagUri);
        } else {
          await TagController.commitDeleteResource({ taggerId, uri, label, tagUri });
        }
        return { success: true };
      } catch (error) {
        update(label, taggerId, !isAdded, tagUri);
        showTagWriteErrorToast(error, isAdded ? 'Could not add tag' : 'Could not remove tag');
        return { success: false };
      }
    } finally {
      pending.current.delete(label);
    }
  };

  const addTag = (label: string) => {
    const existing = current?.tags.find((tag) => tag.label === canonicalizeTagLabel(label));
    // Already the viewer's: nothing to write, and the input may clear.
    if (existing?.relationship) return Promise.resolve({ success: true });
    return write(label, true);
  };

  const toggleTag = (tag: Pick<NexusTag, 'label' | 'relationship' | 'tag_uri'>) =>
    write(tag.label, !tag.relationship, tag.tag_uri);

  const tags = current?.tags ?? [];
  return {
    tags,
    isLoading: Boolean(uri) && !current,
    isAtReadLimit: current?.isTruncated ?? false,
    isError: current?.isError ?? false,
    addTag,
    toggleTag,
  };
}
