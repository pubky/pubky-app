import type { NexusTag } from '@/services/nexus/nexus.types';
import type { TagCollectionModelSchema, TagMutation } from './tag.schema';

/** Legacy collections use their loaded length until server pagination metadata exists. */
export function getTagCursor(record: TagCollectionModelSchema<unknown> | null | undefined): number {
  return record?.cache?.cursor ?? record?.tags.length ?? 0;
}

/** A response can prove foreign membership by an ID, or absence in a complete tagger sample. */
export function getTagMembership(
  tag: NexusTag,
  viewerId: string,
  responseViewerId?: string | null,
): boolean | undefined {
  if (viewerId === responseViewerId) return tag.relationship;
  if (tag.taggers.includes(viewerId)) return true;
  return tag.taggers.length >= tag.taggers_count ? false : undefined;
}

export function getTagMutationEntries(record: TagCollectionModelSchema<unknown> | null | undefined) {
  return Object.entries(record?.mutations ?? {}).map(([key, mutation]) => ({
    key,
    label: mutation.label.toLowerCase(),
    mutation,
  }));
}

/**
 * The viewer's own tag file for a label. A pending local create knows the address it wrote, which Nexus
 * may not report yet; otherwise Nexus is the source, falling back to an expired create's address.
 */
export function getViewerTagUri(
  record: TagCollectionModelSchema<unknown> | null | undefined,
  label: string,
  viewerId: string,
  now = Date.now(),
): string | undefined {
  const mutation = findTagMutation(record, label, viewerId);
  if (mutation && mutation.expiresAt > now) {
    if (!mutation.relationship) return undefined;
    if (mutation.uri) return mutation.uri;
  }
  const tag =
    record?.cache?.viewerId === viewerId
      ? record.tags.find((item) => item.label.toLowerCase() === label.toLowerCase())
      : undefined;
  if (tag?.relationship && tag.tag_uri) return tag.tag_uri;
  return mutation?.relationship ? mutation.uri : undefined;
}

export function findTagMutation(
  record: TagCollectionModelSchema<unknown> | null | undefined,
  label: string,
  viewerId: string,
): TagMutation | undefined {
  return getTagMutationEntries(record).find(
    (entry) => entry.label === label.toLowerCase() && entry.mutation.viewerId === viewerId,
  )?.mutation;
}
