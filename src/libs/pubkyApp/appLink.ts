import { parseOwner, ValidationError } from 'pubky-social-specs';
import { matchPostRoute, matchProfileRoute } from '@/app/routes';
import { isValidPostCompositeId } from '@/libs/utils/utils';
import type { Pubky } from '@/models/models.types';
import { buildCompositeId } from '@/models/models.utils';
import { buildPostUriOrNull } from '@/pipes/post/post.reference';

/**
 * The Pubky object a link to this app names (`getAppLinkReference`): a post, which the app writes by
 * its v1 reference (as a repost or a reply does), or a user (their profile).
 */
export type AppLinkReference = { kind: 'post'; compositeId: string } | { kind: 'user'; pubky: Pubky };

/**
 * What a link typed or pasted into the app names when it points at a post (`/post/{author}/{id}`,
 * `matchPostRoute`) or a profile (`/profile/{key}`, `matchProfileRoute`) on the host the app runs on
 * (`isRunningHostUrl`), so the app writes that object's reference in place of the web link: a tag or
 * an embed on the web link would be an external resource of its own, never the post's or the
 * user's. Null for anything else, which is written as typed: a link to another host (another
 * instance of the app included), another page of this one, a key or post id the data model refuses,
 * a link still being typed, and every link during server rendering. A query or a fragment is
 * ignored. Runs on every keystroke, so it never throws.
 */
export function getAppLinkReference(value: string): AppLinkReference | null {
  const url = toRunningHostUrl(value.trim());
  if (!url) return null;

  const post = matchPostRoute(url.pathname);
  if (post) {
    const compositeId = buildCompositeId({ pubky: post.userId as Pubky, id: post.postId });
    const isPost =
      isValidPostCompositeId(compositeId) && buildPostUriOrNull(post.userId as Pubky, post.postId) !== null;
    return isPost ? { kind: 'post', compositeId } : null;
  }
  const profile = matchProfileRoute(url.pathname);
  return profile && isOwnerKey(profile.pubky) ? { kind: 'user', pubky: profile.pubky as Pubky } : null;
}

/**
 * Whether `url` is on the host the app runs on (`window.location.host`): in any case and with a
 * leading `www.` ignored, as `isSameDomain` compares a domain, but with its port, so the same name
 * on another port is another host. Never during server rendering, where there is no host to compare.
 */
export function isRunningHostUrl(url: URL): boolean {
  return typeof window !== 'undefined' && withoutWww(url.host) === withoutWww(window.location.host);
}

/** A web link (`http:`/`https:`) on the host the app runs on (`isRunningHostUrl`), or null. */
function toRunningHostUrl(value: string): URL | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return (url.protocol === 'http:' || url.protocol === 'https:') && isRunningHostUrl(url) ? url : null;
  } catch {
    return null;
  }
}

function withoutWww(host: string): string {
  return host.toLowerCase().replace(/^www\./, '');
}

/** Whether the data model reads `key` as a user's key (`parseOwner`), so a profile can be named by it. */
function isOwnerKey(key: string): boolean {
  try {
    parseOwner(key);
    return true;
  } catch (error) {
    if (error instanceof ValidationError) return false;
    throw error;
  }
}
