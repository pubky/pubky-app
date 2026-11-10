'use client';

import { useEffect, useRef, useState } from 'react';
import { TagController } from '@/controllers/tag/tag';
import { useRequireAuth } from '@/hooks/useRequireAuth/useRequireAuth';
import { canonicalizeTagLabel } from '@/libs/utils/utils';
import { showTagWriteErrorToast } from '@/molecules/TaggedItem/TaggedItem.utils';
import { withResourceViewerTag } from '@/pipes/tag/tag.resource';
import type { NexusTag } from '@/services/nexus/nexus.types';
import { RESOURCE_TAG_REREADS_MS, RESOURCE_TAGS_LIMIT } from '@/services/nexus/resource/resource.constants';
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
 * With `spellings` (other spellings of the link Pinakes folds into its card), their tags are read
 * along and merged into the link's: one chip per label, each tagger once. A new tag goes on `uri`; a
 * removed one goes on every spelling the viewer's tag is on.
 *
 * @param uri - The link exactly as written, or the card's canonical link; `null` reads nothing
 * @param options.enabled - `false` defers the read (still loading); writes work either way
 * @param options.spellings - Other spellings of `uri` read along (`getResourceTarget`)
 * @param options.spellingsByUri - Read them on a Nexus without `by_ids` too (the resource page)
 */
export function useResourceTags(
  uri: string | null,
  { enabled = true, spellings = [], spellingsByUri = false }: UseResourceTagsOptions = {},
): UseResourceTagsResult {
  const viewerId = useAuthStore((state) => state.currentUserPubky);
  const { waitForAuth } = useRequireAuth();
  // The spellings as one value, so effects follow their content, not the array's identity.
  const spellingsKey = spellings.join('\n');
  const key = uri ? `${uri}\n${viewerId ?? ''}\n${spellingsKey}` : '';
  const [settled, setSettled] = useState<TSettled | null>(null);
  const pending = useRef(new Set<string>());
  const [reread, setReread] = useState<{ key: string; round: number; writtenAt: number } | null>(null);

  // After a write, read the link again once Nexus has had time to index it. The answer reaches this
  // card, and every other card of the link, through the subscription; the viewer's writes Nexus does
  // not show yet stay in it until the last read.
  const currentReread = reread?.key === key && uri ? reread : null;
  useEffect(() => {
    if (!currentReread || !uri) return;
    const { round, writtenAt } = currentReread;
    const isLast = round === RESOURCE_TAG_REREADS_MS.length - 1;
    const delay = Math.max(0, writtenAt + RESOURCE_TAG_REREADS_MS[round] - Date.now());
    let cancelled = false;
    const next = () => {
      if (!cancelled && !isLast) setReread({ key, round: round + 1, writtenAt });
    };
    const links = withSpellings(spellingsKey);
    const timer = setTimeout(() => {
      TagController.fetchResourceTags({
        uri,
        viewerId,
        ...links,
        ...(spellingsByUri ? { spellingsByUri } : {}),
        fresh: true,
      }).then(
        (tags) => {
          if (cancelled) return;
          // A write of this card's in flight keeps its optimistic state; the chain goes on regardless,
          // so the writes before it still get their last read.
          if (pending.current.size === 0) {
            setSettled((state) => (state?.key === key ? { ...state, tags } : state));
          }
          if (TagController.hasUnconfirmedResourceTags({ uri, viewerId, ...links })) next();
        },
        // The service reported the failure through Err.*: the state shown stays, and the next round runs.
        next,
      );
    }, delay);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [currentReread, uri, viewerId, key, spellingsKey, spellingsByUri]);

  useEffect(() => {
    if (!uri || !enabled) return;
    // Set by the cleanup when the link or viewer changes, so a late answer never replaces a newer one.
    let cancelled = false;
    const links = withSpellings(spellingsKey);
    // Another card of the same link (a post and its repost, the resource page) read or wrote: show
    // it here too. A write of this card's own in flight keeps its optimistic state until it settles.
    const unsubscribe = TagController.subscribeResourceTags({ uri, viewerId, ...links }, (tags) => {
      if (cancelled || pending.current.size > 0) return;
      // A write on another card changed the shared answer; a full answer it came from stays full.
      setSettled((state) => ({
        key,
        tags,
        isTruncated: tags.length >= RESOURCE_TAGS_LIMIT || (state?.key === key && state.isTruncated),
        isError: false,
      }));
    });
    TagController.fetchResourceTags({ uri, viewerId, ...links, ...(spellingsByUri ? { spellingsByUri } : {}) }).then(
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
  }, [uri, viewerId, key, enabled, spellingsKey, spellingsByUri]);

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
          await TagController.commitDeleteResource({ taggerId, uri, label, tagUri, ...withSpellings(spellingsKey) });
        }
        setReread({ key, round: 0, writtenAt: Date.now() });
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

/** The spellings `useResourceTags` was given, from their one-value form, as the controller's parameter. */
function withSpellings(spellingsKey: string): { spellings?: string[] } {
  return spellingsKey ? { spellings: spellingsKey.split('\n') } : {};
}
