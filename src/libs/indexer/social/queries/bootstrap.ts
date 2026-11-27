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
const HOT_TAGGERS_LIMIT = 5;
/** The central indexer ranks the bootstrap's influencers and hot tags over the last day. */
const TIMEFRAME = 'today';
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
 * The sign-in page: the newest root posts in scope with up to three replies each, today's top influencers, the
 * user's recommendations, today's hot tags, every user those name, and the user's notifications. `indexed` is false
 * until the user's profile is in the view and the first scope sync has finished.
 */
export function bootstrap(
  view: SocialView,
  context: QueryContext,
  { user_id }: { user_id: string },
): Answer<BootstrapJson> {
  const known = attempt(() => view.profile(user_id) !== null, false);
  const viewer = known ? user_id : undefined;
  const stream = attempt(() => postStreamKeys(view, { source: 'all', limit: STREAM_LIMIT }).data.post_keys, []);
  const posted = stream.flatMap((key) => {
    const ref = parsePostKey(key);
    const post = ref === null ? null : view.post(ref.author, ref.postId);
    return post === null ? [] : [post];
  });
  const replies = posted.flatMap((post) => view.repliesTo(post.author, post.postId).slice(0, REPLIES_PER_POST));
  const posts = [...posted, ...replies].flatMap((post) => attempt(() => [postViewJson(view, post, viewer)], []));
  const influencers = attempt(
    () => userStreamIds(view, context, { source: 'influencers', timeframe: TIMEFRAME, preview: true }).data,
    [],
  );
  const recommended = known
    ? attempt(() => userStreamIds(view, context, { source: 'recommended', user_id, limit: RECOMMENDED_LIMIT }).data, [])
    : [];
  const hot = attempt(
    () =>
      hotTags(view, context, { timeframe: TIMEFRAME, limit: HOT_TAGS_LIMIT, taggers_limit: HOT_TAGGERS_LIMIT }).data,
    [],
  );
  const named = new Set<string>([
    ...(known ? [user_id] : []),
    ...[...posted, ...replies].map(({ author }) => author),
    ...influencers,
    ...recommended,
    ...hot.flatMap(({ taggers_id }) => taggers_id),
  ]);
  const users = [...named]
    .sort(compareText)
    .flatMap((user) => attempt(() => userViewJson(view, user, viewer) ?? [], []));
  const notified =
    known && user_id === context.seed && inScope(view, user_id)
      ? attempt(() => notifications(view, context, { user_id, limit: NOTIFICATIONS_LIMIT }).data, [])
      : [];
  // The app asks again later for a user not indexed, so a bootstrap of a partial scope gets refreshed.
  const indexed = known && context.syncing !== true;
  return scoped(
    { users, posts, ids: { stream, influencers, recommended, hot_tags: hot }, indexed, notifications: notified },
    'notification and indexed_at times estimated from homeserver event order',
  );
}
