import { PubkyAppFeedLayout, PubkyAppFeedReach, PubkyAppFeedSort, PubkyAppPostKind } from 'pubky-app-specs';
import { z } from 'zod';
import { DEFAULT_CUSTOM_FEED_ICON } from '@/config/feed';
import { TAGGED_AS_FILTER_KEY } from '@/config/feed';
import type { FeedModelSchema } from '@/models/feed/feed.schema';

/** Sentinel for "no content filter" — stored as `null` on the feed record. */
export const CUSTOM_FEED_CONTENT_ALL = 'ALL';

export const CUSTOM_FEED_FORM_FIELDS = {
  NAME: 'name',
  ICON: 'icon',
  REACH: 'reach',
  SORT: 'sort',
  LAYOUT: 'layout',
  CONTENT: 'content',
  TAGS: 'tags',
  DOMAIN_TAGS: 'domain_tags',
} as const;

/**
 * Form-level reach includes the Tagged-as UI sentinel. On submit that sentinel
 * is rewritten to `PubkyAppFeedReach.Wot` with the form's `domain_tags`.
 */
export type CustomFeedFormReach = PubkyAppFeedReach | typeof TAGGED_AS_FILTER_KEY;

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
    [CUSTOM_FEED_FORM_FIELDS.REACH]: z.union([z.enum(PubkyAppFeedReach), z.literal(TAGGED_AS_FILTER_KEY)]),
    [CUSTOM_FEED_FORM_FIELDS.SORT]: z.enum(PubkyAppFeedSort),
    [CUSTOM_FEED_FORM_FIELDS.LAYOUT]: z.enum(PubkyAppFeedLayout),
    [CUSTOM_FEED_FORM_FIELDS.CONTENT]: z.union([z.literal(CUSTOM_FEED_CONTENT_ALL), z.enum(PubkyAppPostKind)]),
    [CUSTOM_FEED_FORM_FIELDS.TAGS]: z.array(z.string()),
    [CUSTOM_FEED_FORM_FIELDS.DOMAIN_TAGS]: z.array(z.string()),
  })
  .refine((data) => data.tags.length > 0 || data.domain_tags.length > 0)
  .refine((data) => data.reach !== TAGGED_AS_FILTER_KEY || data.domain_tags.length > 0);

export type CustomFeedFormData = z.infer<typeof customFeedFormSchema>;
export type CustomFeedFormContent = CustomFeedFormData['content'];

/** Default values for a brand new feed. */
export const customFeedFormDefaults: CustomFeedFormData = {
  [CUSTOM_FEED_FORM_FIELDS.NAME]: '',
  [CUSTOM_FEED_FORM_FIELDS.ICON]: DEFAULT_CUSTOM_FEED_ICON,
  [CUSTOM_FEED_FORM_FIELDS.REACH]: PubkyAppFeedReach.All,
  [CUSTOM_FEED_FORM_FIELDS.SORT]: PubkyAppFeedSort.Recent,
  [CUSTOM_FEED_FORM_FIELDS.LAYOUT]: PubkyAppFeedLayout.Columns,
  [CUSTOM_FEED_FORM_FIELDS.CONTENT]: CUSTOM_FEED_CONTENT_ALL,
  [CUSTOM_FEED_FORM_FIELDS.TAGS]: [],
  [CUSTOM_FEED_FORM_FIELDS.DOMAIN_TAGS]: [],
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
  const isTaggedAsFeed = feed.reach === PubkyAppFeedReach.Wot && domainTags.length > 0;

  return {
    [CUSTOM_FEED_FORM_FIELDS.NAME]: feed.name,
    [CUSTOM_FEED_FORM_FIELDS.ICON]: feed.icon ?? DEFAULT_CUSTOM_FEED_ICON,
    [CUSTOM_FEED_FORM_FIELDS.REACH]: isTaggedAsFeed ? TAGGED_AS_FILTER_KEY : feed.reach,
    [CUSTOM_FEED_FORM_FIELDS.SORT]: feed.sort,
    [CUSTOM_FEED_FORM_FIELDS.LAYOUT]: feed.layout,
    [CUSTOM_FEED_FORM_FIELDS.CONTENT]: feed.content === null ? CUSTOM_FEED_CONTENT_ALL : feed.content,
    [CUSTOM_FEED_FORM_FIELDS.TAGS]: feed.tags,
    [CUSTOM_FEED_FORM_FIELDS.DOMAIN_TAGS]: domainTags,
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
