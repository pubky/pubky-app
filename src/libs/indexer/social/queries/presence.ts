import { idMicros } from 'pubky-social-specs';
import type { UserData } from '../social.types';
import type { SocialPost, SocialView } from '../social.view';
import { isCrawled } from './graph';
import { NotFoundQueryError } from './queries.errors';
import type { MoreHint } from './queries.types';
import { postKeyOf } from './wire';

// Whether something the view lacks is absent or only not loaded yet.

function createdAtMs(postId: string): number | null {
  try {
    return Math.floor(idMicros(postId) / 1000);
  } catch {
    return null;
  }
}

/**
 * The view proves a post absent when tombstones show every version deleted, when its author's activity is loaded
 * back to the time its id claims, or when the id is no post id at all.
 */
export function postKnownAbsent(view: SocialView, author: string, postId: string): boolean {
  const created = createdAtMs(postId);
  if (created === null || view.postDeleted(author, postId)) return true;
  if (!isCrawled(view, author)) return false;
  const { complete, sinceMs } = view.historyOf(author);
  return complete || (sinceMs !== null && created >= sinceMs);
}

/** The view proves a user has no profile when a tombstone shows it deleted, or the graph is loaded from the start. */
export function userKnownAbsent(view: SocialView, user: string): boolean {
  return view.profileDeleted(user) || (isCrawled(view, user) && view.historyOf(user, 'graph').complete);
}

/** The hint that would load a post the view lacks, `null` when it is known absent. */
export function postHint(view: SocialView, author: string, postId: string): MoreHint | null {
  return postKnownAbsent(view, author, postId) ? null : { kind: 'post', author, postId };
}

export function userHint(view: SocialView, user: string): MoreHint | null {
  return userKnownAbsent(view, user) ? null : { kind: 'user', user };
}

export const hintsOf = (hints: readonly (MoreHint | null)[]): MoreHint[] =>
  hints.filter((hint): hint is MoreHint => hint !== null);

export function postOrNotFound(view: SocialView, query: string, author: string, postId: string): SocialPost {
  const post = view.post(author, postId);
  if (post !== null) return post;
  const hint = postHint(view, author, postId);
  throw new NotFoundQueryError(query, 'post', postKeyOf(author, postId), hint === null, hintsOf([hint]));
}

export function profileOrNotFound(view: SocialView, query: string, user: string): UserData {
  const profile = view.profile(user);
  if (profile !== null) return profile;
  const hint = userHint(view, user);
  throw new NotFoundQueryError(query, 'user', user, hint === null, hintsOf([hint]));
}
