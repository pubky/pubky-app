import { isEqual } from 'lodash-es';
import type { KnownFeedReach } from 'pubky-social-specs';
import { feedLayouts, feedReaches, feedSorts, postKinds } from 'pubky-social-specs';
import { z } from 'zod';
import { DEFAULT_CUSTOM_FEED_ICON } from '@/config/feed';
import { TAGGED_AS_FILTER_KEY } from '@/config/feed';
import { isPinakesReachSetServed, RESOURCE_MORE_KINDS } from '@/config/pinakes';
import {
  parseFeedResourceFilters,
  toFeedResourceFilters,
  toKindAndTypes,
} from '@/hooks/useCustomResourceFeed/useCustomResourceFeed.utils';
import {
  parseResourceSearchFilters,
  toResourceFeedFilters,
} from '@/hooks/useResourceSearchFilters/useResourceSearchFilters';
import type { FeedModelSchema, TFeedResourceFilters } from '@/models/feed/feed.schema';
import { getResourceKind, toResourceFeedTypesValue } from '@/pipes/resource/resource.search';

/** Sentinel for "no content filter" — stored as `null` on the feed record. */
export const CUSTOM_FEED_CONTENT_ALL = 'ALL';

/**
 * Sentinel for "every type" of a feed of external resources — stored as `null` types. Lowercase, so no
 * schema.org type name (`ALL` is a valid spelling of one) can be read as it.
 */
export const CUSTOM_FEED_RESOURCE_TYPES_ALL = 'all';

/**
 * Sentinel for a feed of external resources — stored as `target: 'resources'` with no content
 * filter: a resource is no post, so it has no post kind.
 */
export const CUSTOM_FEED_CONTENT_RESOURCES = 'RESOURCES';

export const CUSTOM_FEED_FORM_FIELDS = {
  NAME: 'name',
  ICON: 'icon',
  REACH: 'reach',
  SORT: 'sort',
  LAYOUT: 'layout',
  CONTENT: 'content',
  TAGS: 'tags',
  DOMAIN_TAGS: 'domain_tags',
  RESOURCE_TYPES: 'resource_types',
  RESOURCE_FILTERS: 'resource_filters',
} as const;

/**
 * The reaches a feed of external resources can be searched in: All, Following, Friends, and My network
 * where the configured Pinakes serves it (Pinakes has none for Me or Followers).
 */
export function getCustomFeedResourceReaches(): readonly string[] {
  return isPinakesReachSetServed() ? ['all', 'wot', 'following', 'friends'] : ['all', 'following', 'friends'];
}

/**
 * Form-level reach includes the Tagged-as UI sentinel. On submit that sentinel
 * is rewritten to `'wot'` with the form's `domain_tags`.
 */
export type CustomFeedFormReach = KnownFeedReach | typeof TAGGED_AS_FILTER_KEY;

/**
 * Schema for the create/edit custom feed form.
 *
 * Unlike `useCreateCollection`, this is not a translator factory: the dialog
 * surfaces validation by disabling the save button rather than rendering field
 * messages, so zod's default messages are never shown to a user and there is
 * nothing to localize. Add a factory here if a field ever renders its error.
 */
export const customFeedFormSchema = z
  .object({
    [CUSTOM_FEED_FORM_FIELDS.NAME]: z.string().refine((value) => value.trim().length > 0),
    [CUSTOM_FEED_FORM_FIELDS.ICON]: z.string().min(1),
    [CUSTOM_FEED_FORM_FIELDS.REACH]: z.union([z.enum(feedReaches), z.literal(TAGGED_AS_FILTER_KEY)]),
    [CUSTOM_FEED_FORM_FIELDS.SORT]: z.enum(feedSorts),
    [CUSTOM_FEED_FORM_FIELDS.LAYOUT]: z.enum(feedLayouts),
    [CUSTOM_FEED_FORM_FIELDS.CONTENT]: z.union([
      z.literal(CUSTOM_FEED_CONTENT_ALL),
      z.literal(CUSTOM_FEED_CONTENT_RESOURCES),
      z.enum(postKinds),
    ]),
    [CUSTOM_FEED_FORM_FIELDS.TAGS]: z.array(z.string()),
    [CUSTOM_FEED_FORM_FIELDS.DOMAIN_TAGS]: z.array(z.string()),
    // The feed's types as one value (`MusicAlbum,MusicRecording`), or every type
    [CUSTOM_FEED_FORM_FIELDS.RESOURCE_TYPES]: z.string().min(1),
    // The saved search filters of a feed of external resources (When, Where…), as the specs store them
    [CUSTOM_FEED_FORM_FIELDS.RESOURCE_FILTERS]: z.record(z.string(), z.string()).nullable(),
  })
  .refine((data) => data.tags.length > 0 || data.domain_tags.length > 0)
  .refine((data) => data.reach !== TAGGED_AS_FILTER_KEY || data.domain_tags.length > 0)
  // External resources carry no profile tags, and are searched in the network reaches only.
  .refine(
    (data) =>
      data.content !== CUSTOM_FEED_CONTENT_RESOURCES ||
      (data.domain_tags.length === 0 && getCustomFeedResourceReaches().includes(data.reach)),
  );

export type CustomFeedFormData = z.infer<typeof customFeedFormSchema>;
export type CustomFeedFormContent = CustomFeedFormData['content'];

/** Default values for a brand new feed. */
export const customFeedFormDefaults: CustomFeedFormData = {
  [CUSTOM_FEED_FORM_FIELDS.NAME]: '',
  [CUSTOM_FEED_FORM_FIELDS.ICON]: DEFAULT_CUSTOM_FEED_ICON,
  [CUSTOM_FEED_FORM_FIELDS.REACH]: 'all',
  [CUSTOM_FEED_FORM_FIELDS.SORT]: 'recent',
  [CUSTOM_FEED_FORM_FIELDS.LAYOUT]: 'columns',
  [CUSTOM_FEED_FORM_FIELDS.CONTENT]: CUSTOM_FEED_CONTENT_ALL,
  [CUSTOM_FEED_FORM_FIELDS.TAGS]: [],
  [CUSTOM_FEED_FORM_FIELDS.DOMAIN_TAGS]: [],
  [CUSTOM_FEED_FORM_FIELDS.RESOURCE_TYPES]: CUSTOM_FEED_RESOURCE_TYPES_ALL,
  [CUSTOM_FEED_FORM_FIELDS.RESOURCE_FILTERS]: null,
};

/**
 * Maps a stored feed onto form values for edit mode.
 *
 * An icon name unknown to our Lucide set is kept as-is — it may come from
 * another client using its own icon set, and an unrelated edit must not
 * overwrite it (`FeedValidators.sanitizeIcon` makes the same promise, and
 * already coerced anything outside specs' charset/length at read time). The
 * picker simply shows no selection and the trigger renders the default glyph.
 *
 * WoT + profile tags is the Tagged-as authoring surface: show the sentinel so
 * the dialog reveals the profile-tag editor. Other reaches keep any legacy
 * `domain_tags` for read-only display until the user changes reach.
 */
export function customFeedFormValuesFromFeed(feed: FeedModelSchema): CustomFeedFormData {
  const domainTags = feed.domain_tags ?? [];
  const isTaggedAsFeed = feed.reach === 'wot' && domainTags.length > 0;

  return {
    [CUSTOM_FEED_FORM_FIELDS.NAME]: feed.name,
    [CUSTOM_FEED_FORM_FIELDS.ICON]: feed.icon ?? DEFAULT_CUSTOM_FEED_ICON,
    [CUSTOM_FEED_FORM_FIELDS.REACH]: isTaggedAsFeed ? TAGGED_AS_FILTER_KEY : feed.reach,
    [CUSTOM_FEED_FORM_FIELDS.SORT]: feed.sort,
    [CUSTOM_FEED_FORM_FIELDS.LAYOUT]: feed.layout,
    [CUSTOM_FEED_FORM_FIELDS.CONTENT]:
      feed.target === 'resources'
        ? CUSTOM_FEED_CONTENT_RESOURCES
        : feed.content === null
          ? CUSTOM_FEED_CONTENT_ALL
          : feed.content,
    [CUSTOM_FEED_FORM_FIELDS.TAGS]: feed.tags,
    [CUSTOM_FEED_FORM_FIELDS.DOMAIN_TAGS]: domainTags,
    [CUSTOM_FEED_FORM_FIELDS.RESOURCE_TYPES]: feed.resource_types?.length
      ? toResourceFeedTypesValue(feed.resource_types)
      : CUSTOM_FEED_RESOURCE_TYPES_ALL,
    [CUSTOM_FEED_FORM_FIELDS.RESOURCE_FILTERS]: feed.target === 'resources' ? (feed.resource_filters ?? null) : null,
  };
}

/** A feed's types (the form's value) the Kind filter cannot show, kept as they are; else every type. */
const getTypesWithoutKind = (types: string) =>
  types !== CUSTOM_FEED_RESOURCE_TYPES_ALL && !toKindAndTypes(types.split(','))
    ? types
    : CUSTOM_FEED_RESOURCE_TYPES_ALL;

/**
 * The form with the External resources filters a page's URL holds (`hasResourceFeedFilters`): Home's
 * External resources, or a custom resources feed's panel. A feed created there, or the feed on screen
 * edited, saves what the viewer sees: its kind and sub-kinds as the Type, Popular or Recent as the
 * Sort, and the rest as its filters.
 */
export function withPageResourceFilters(
  values: CustomFeedFormData,
  params: Pick<URLSearchParams, 'get'>,
): CustomFeedFormData {
  const filters = toResourceFeedFilters(parseResourceSearchFilters(params));
  const kind = filters.kind ? getResourceKind(filters.kind) : null;
  const types = filters.types.length > 0 ? filters.types : (kind?.types ?? []);
  const sort = filters.sort === 'activity' ? 'popularity' : filters.sort === 'recent' ? 'recent' : values.sort;
  // No Kind picked is every type, but for a feed's types no Kind stands for, which the panel keeps; More
  // kinds' All types is every type too, less the kinds' (its `exclude_types` filter)
  const resourceTypes =
    types.length > 0
      ? toResourceFeedTypesValue(types)
      : filters.kind === RESOURCE_MORE_KINDS
        ? CUSTOM_FEED_RESOURCE_TYPES_ALL
        : getTypesWithoutKind(values.resource_types);
  // The stored filters while the page reads as them, of the same types: a value the panel spells
  // otherwise (the default Trending window) stays as stored, so a rename keeps the feed's id
  // A feed of More kinds keeps the types it saved to leave out while the page shows its All types (the
  // list searched is the saved one, whatever this app's kinds are now)
  const storedExclusion = values.resource_filters?.exclude_types;
  const keepExclusion = (f: TFeedResourceFilters | null) =>
    f?.exclude_types && storedExclusion ? { ...f, exclude_types: storedExclusion } : f;
  const pageFilters = keepExclusion(toFeedResourceFilters(filters));
  const storedTypes =
    values.resource_types === CUSTOM_FEED_RESOURCE_TYPES_ALL ? null : values.resource_types.split(',');
  const isStored =
    resourceTypes === values.resource_types &&
    isEqual(
      pageFilters,
      keepExclusion(toFeedResourceFilters(parseFeedResourceFilters(storedTypes, values.resource_filters))),
    );
  return {
    ...values,
    // The dialog moves a reach and profile tags External resources have none for, as picking it does
    [CUSTOM_FEED_FORM_FIELDS.CONTENT]: CUSTOM_FEED_CONTENT_RESOURCES,
    [CUSTOM_FEED_FORM_FIELDS.SORT]: sort,
    [CUSTOM_FEED_FORM_FIELDS.RESOURCE_TYPES]: resourceTypes,
    [CUSTOM_FEED_FORM_FIELDS.RESOURCE_FILTERS]: isStored ? values.resource_filters : pageFilters,
  };
}

type UseCustomFeedFormBaseParams = {
  /**
   * Whether the host dialog is currently open. The hook re-seeds the form from
   * `feed` whenever this is false, so a dialog reopened after a background sync
   * shows current values without discarding in-progress edits.
   */
  open: boolean;
};

export type UseCustomFeedFormParams = UseCustomFeedFormBaseParams &
  ({ mode: 'create'; feed?: never } | { mode: 'edit'; feed: FeedModelSchema });
