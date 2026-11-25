import type { SocialView } from '../social.view';
import { compareText, limitOf, page, skipOf } from './params';
import { UnavailableQueryError } from './queries.errors';
import { type Answer, type NotificationJson, type QueryContext, scoped } from './queries.types';
import { postUri } from './wire';

export interface NotificationsParams {
  user_id: string;
  skip?: number;
  limit?: number;
  /** The newest timestamp served, inclusive. */
  start?: number;
  /** The oldest timestamp served, inclusive. */
  end?: number;
}

/** A follow or tag of unknown time sorts as the oldest, at timestamp 0. */
const UNDATED = 0;

/** Who acted and on what, so equal timestamps keep one order. */
function tieKey({ body }: NotificationJson): string {
  return Object.values(body).join('\u0000');
}

/**
 * A follow of the seed, or `new_friend` when the seed already followed back: the later of two mutual follows
 * makes the friendship. Follows of unknown order stay plain follows.
 */
function followOf(view: SocialView, seed: string, follower: string): NotificationJson {
  const followedAt = view.followedAtMs(follower, seed);
  const followedBackAt = view.followedAtMs(seed, follower);
  const befriended = followedAt !== null && followedBackAt !== null && followedBackAt <= followedAt;
  return {
    timestamp: followedAt ?? UNDATED,
    body: { type: befriended ? 'new_friend' : 'follow', followed_by: follower },
  };
}

/**
 * Everything the seed's scope says happened to the seed, newest first. Only events by authors in scope are known;
 * follows and tags carry their estimated time.
 */
function notificationsOf(view: SocialView, seed: string): NotificationJson[] {
  const found: NotificationJson[] = [];
  for (const follower of view.followers(seed)) {
    if (follower !== seed) found.push(followOf(view, seed, follower));
  }
  for (const own of view.postsBy(seed)) {
    const ownUri = postUri(seed, own.postId);
    for (const reply of view.repliesTo(seed, own.postId)) {
      if (reply.author === seed) continue;
      found.push({
        timestamp: reply.createdAtMs,
        body: {
          type: 'reply',
          replied_by: reply.author,
          parent_post_uri: ownUri,
          reply_uri: postUri(reply.author, reply.postId),
          post_kind: own.data.kind,
        },
      });
    }
    for (const repost of view.repostsOf(seed, own.postId)) {
      if (repost.author === seed) continue;
      found.push({
        timestamp: repost.createdAtMs,
        body: {
          type: 'repost',
          reposted_by: repost.author,
          embed_uri: ownUri,
          repost_uri: postUri(repost.author, repost.postId),
          post_kind: own.data.kind,
        },
      });
    }
  }
  for (const tagger of view.authors) {
    if (tagger === seed) continue;
    for (const { target, label, atMs } of view.tagsBy(tagger)) {
      if (target.kind === 'user' && target.author === seed) {
        found.push({ timestamp: atMs ?? UNDATED, body: { type: 'tag_profile', tagged_by: tagger, tag_label: label } });
      }
      const own = target.kind === 'post' && target.author === seed ? view.post(seed, target.postId) : null;
      if (own === null) continue;
      const body = {
        type: 'tag_post' as const,
        tagged_by: tagger,
        tag_label: label,
        post_uri: postUri(seed, own.postId),
        post_kind: own.data.kind,
      };
      found.push({ timestamp: atMs ?? UNDATED, body });
    }
  }
  for (const mention of view.mentionsOf(seed)) {
    if (mention.author === seed) continue;
    found.push({
      timestamp: mention.createdAtMs,
      body: {
        type: 'mention',
        mentioned_by: mention.author,
        post_uri: postUri(mention.author, mention.postId),
        post_kind: mention.data.kind,
      },
    });
  }
  return found.sort((a, b) => b.timestamp - a.timestamp || compareText(tieKey(a), tieKey(b)));
}

/** The seed's notifications; anyone else's need events by authors outside the scope. */
export function notifications(
  view: SocialView,
  context: QueryContext,
  params: NotificationsParams,
): Answer<NotificationJson[]> {
  const query = 'user/notifications';
  if (params.user_id !== context.seed) {
    throw new UnavailableQueryError(query, "only the seed's notifications are local");
  }
  const skip = skipOf(query, params.skip);
  const limit = limitOf(query, params.limit, { fallback: 20, max: 100 });
  const { start, end } = params;
  const listed = notificationsOf(view, context.seed).filter(
    ({ timestamp }) => (start === undefined || timestamp <= start) && (end === undefined || timestamp >= end),
  );
  return scoped(
    page(listed, skip, limit),
    'events by authors in the scope; follow and tag times estimated from homeserver event order',
  );
}
