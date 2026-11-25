import type { SocialView } from '../social.view';
import { inScope } from './graph';
import { notifications } from './notifications';
import { compareText } from './params';
import { postStreamKeys } from './postStream';
import { type Answer, type BootstrapJson, type QueryContext, scoped } from './queries.types';
import { hotTags } from './tags';
import { userStreamIds } from './users';
import { parsePostKey, postViewJson, userViewJson } from './wire';

const STREAM_LIMIT = 20;
const REPLIES_PER_POST = 3;
const NOTIFICATIONS_LIMIT = 30;
const HOT_TAGS_LIMIT = 5;
const RECOMMENDED_LIMIT = 5;

/** The part's value, or its empty value when the part cannot be answered: a bootstrap is never refused. */
function attempt<T>(part: () => T, empty: T): T {
  try {
    return part();
  } catch {
    return empty;
  }
}

/**
 * The sign-in page: the newest root posts in scope with up to three replies each, the top influencers, the
 * user's recommendations, the hot tags, every user those name, and the user's notifications.
 */
export function bootstrap(
  view: SocialView,
  context: QueryContext,
  { user_id }: { user_id: string },
): Answer<BootstrapJson> {
  const indexed = attempt(() => view.profile(user_id) !== null, false);
  const viewer = indexed ? user_id : undefined;
  const stream = attempt(() => postStreamKeys(view, { source: 'all', limit: STREAM_LIMIT }).data.post_keys, []);
  const posted = stream.flatMap((key) => {
    const ref = parsePostKey(key);
    const post = ref === null ? null : view.post(ref.author, ref.postId);
    return post === null ? [] : [post];
  });
  const replies = posted.flatMap((post) => view.repliesTo(post.author, post.postId).slice(0, REPLIES_PER_POST));
  const posts = [...posted, ...replies].flatMap((post) => attempt(() => [postViewJson(view, post, viewer)], []));
  const influencers = attempt(() => userStreamIds(view, { source: 'influencers', preview: true }).data, []);
  const recommended = indexed
    ? attempt(() => userStreamIds(view, { source: 'recommended', user_id, limit: RECOMMENDED_LIMIT }).data, [])
    : [];
  const hot = attempt(() => hotTags(view, { limit: HOT_TAGS_LIMIT }).data, []);
  const named = new Set<string>([
    ...(indexed ? [user_id] : []),
    ...[...posted, ...replies].map(({ author }) => author),
    ...influencers,
    ...recommended,
    ...hot.flatMap(({ taggers_id }) => taggers_id),
  ]);
  const users = [...named]
    .sort(compareText)
    .flatMap((user) => attempt(() => userViewJson(view, user, viewer) ?? [], []));
  const notified =
    indexed && user_id === context.seed && inScope(view, user_id)
      ? attempt(() => notifications(view, context, { user_id, limit: NOTIFICATIONS_LIMIT }).data, [])
      : [];
  return scoped({
    users,
    posts,
    ids: { stream, influencers, recommended, hot_tags: hot },
    indexed,
    notifications: notified,
  });
}
