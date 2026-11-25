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

/** A follow or a tag file carries no time, so those notifications sort as the oldest, at timestamp 0. */
const UNDATED = 0;

/** Who acted and on what, so equal timestamps keep one order. */
function tieKey({ body }: NotificationJson): string {
  return Object.values(body).join('\u0000');
}

/** Everything the seed's scope says happened to the seed, newest first. Only events by authors in scope are known. */
function notificationsOf(view: SocialView, seed: string): NotificationJson[] {
  const found: NotificationJson[] = [];
  for (const follower of view.followers(seed)) {
    if (follower !== seed) found.push({ timestamp: UNDATED, body: { type: 'follow', followed_by: follower } });
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
    for (const { label, taggers } of view.tagsOnPost(seed, own.postId)) {
      for (const tagger of taggers) {
        if (tagger === seed) continue;
        const body = {
          type: 'tag_post' as const,
          tagged_by: tagger,
          tag_label: label,
          post_uri: ownUri,
          post_kind: own.data.kind,
        };
        found.push({ timestamp: UNDATED, body });
      }
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
  for (const { label, taggers } of view.tagsOnUser(seed)) {
    for (const tagger of taggers) {
      if (tagger === seed) continue;
      found.push({ timestamp: UNDATED, body: { type: 'tag_profile', tagged_by: tagger, tag_label: label } });
    }
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
  return scoped(page(listed, skip, limit), 'events by authors in the scope; follows and tags undated');
}
