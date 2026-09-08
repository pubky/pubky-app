import type { TagCollectionModelSchema } from '@/models/shared/tag/tag.schema';
import { getTagMembership, getTagMutationEntries } from '@/models/shared/tag/tag.utils';
import type { NexusTag } from '@/services/nexus/nexus.types';

/** Reconcile server evidence and pending local writes; pagination can retain earlier pages. */
export function reconcileTagWindow(
  incoming: NexusTag[],
  existing: TagCollectionModelSchema<string> | undefined,
  now: number,
  viewerId?: string,
  options: { append?: boolean; complete?: boolean } = {},
) {
  const tags = new Map(
    [...(options.append ? (existing?.tags ?? []) : []), ...incoming].map((tag) => [tag.label.toLowerCase(), tag]),
  );
  const mutations: NonNullable<TagCollectionModelSchema<string>['mutations']> = {};
  for (const { key, label, mutation } of getTagMutationEntries(existing)) {
    // A replacement retires expired intent along with the optimistic window.
    // An append still retains earlier pages, so preserve pending rollback ownership.
    if (mutation.expiresAt <= now && (mutation.synced !== false || !options.append)) continue;
    const remote = incoming.find((tag) => tag.label.toLowerCase() === label);
    const acknowledged = remote
      ? getTagMembership(remote, mutation.viewerId, viewerId)
      : options.complete
        ? false
        : undefined;
    if (mutation.synced !== false && acknowledged === mutation.relationship) continue;
    mutations[key] = mutation;
    if (mutation.expiresAt <= now) continue;

    const tag = tags.get(label);
    if (!tag) {
      if (mutation.relationship) {
        const local = existing?.tags.find((item) => item.label.toLowerCase() === label);
        tags.set(
          label,
          local
            ? {
                ...local,
                relationship: mutation.viewerId === viewerId,
              }
            : {
                label: mutation.label ?? label,
                taggers: [mutation.viewerId],
                taggers_count: 1,
                relationship: mutation.viewerId === viewerId,
              },
        );
      }
      continue;
    }
    const membership = getTagMembership(tag, mutation.viewerId, viewerId);
    const previousCount =
      existing?.tags.find((item) => item.label.toLowerCase() === label)?.taggers_count ?? tag.taggers_count;
    const count =
      membership === undefined
        ? mutation.relationship
          ? Math.max(tag.taggers_count, Math.min(previousCount, tag.taggers_count + 1))
          : Math.min(tag.taggers_count, Math.max(previousCount, tag.taggers_count - 1))
        : Math.max(0, tag.taggers_count + Number(mutation.relationship) - Number(membership));
    if (!count) {
      tags.delete(label);
      continue;
    }
    const taggers = tag.taggers.filter((tagger) => tagger !== mutation.viewerId);
    if (mutation.relationship) taggers.push(mutation.viewerId);
    tags.set(label, {
      ...tag,
      taggers,
      taggers_count: count,
      relationship: mutation.viewerId === viewerId ? mutation.relationship : tag.relationship,
    });
  }
  return { tags: [...tags.values()], mutations };
}

/** Only unacknowledged changes may adjust fresh global counters. */
export function reconcileTagCounts(
  incoming: { tags: number; unique_tags: number },
  preview: NexusTag[],
  existing: TagCollectionModelSchema<string> | undefined,
  previous: { tags: number; unique_tags: number } | undefined,
  viewerId: string | undefined,
  now: number,
) {
  let tags = incoming.tags;
  let unique = incoming.unique_tags;
  let additions = 0;
  let removals = 0;
  const addedLabels = new Set<string>();
  const removedLabels = new Set<string>();
  const byLabel = new Map<string, ReturnType<typeof getTagMutationEntries>>();
  for (const entry of getTagMutationEntries(existing)) {
    if (entry.mutation.expiresAt <= now) continue;
    byLabel.set(entry.label, [...(byLabel.get(entry.label) ?? []), entry]);
  }
  for (const [label, entries] of byLabel) {
    const remote = preview.find((tag) => tag.label.toLowerCase() === label);
    let delta = 0;
    for (const { mutation } of entries) {
      const membership = remote
        ? getTagMembership(remote, mutation.viewerId, viewerId)
        : incoming.unique_tags <= preview.length
          ? false
          : undefined;
      if (membership === undefined) {
        if (mutation.relationship) {
          additions++;
          addedLabels.add(label);
        } else {
          removals++;
          removedLabels.add(label);
        }
      } else {
        delta += Number(mutation.relationship) - Number(membership);
      }
    }
    tags += delta;
    // A label becomes present/absent once, even when several viewers change it.
    unique += Number((remote?.taggers_count ?? 0) + delta > 0) - Number(!!remote);
  }
  const bound = (total: number, previousTotal: number, added: number, removed: number) =>
    Math.max(0, total - removed, Math.min(previousTotal, total + added));
  if (previous && (additions || removals)) {
    return {
      tags: bound(tags, previous.tags, additions, removals),
      unique_tags: bound(unique, previous.unique_tags, addedLabels.size, removedLabels.size),
    };
  }
  return { tags: Math.max(0, tags), unique_tags: Math.max(0, unique) };
}
