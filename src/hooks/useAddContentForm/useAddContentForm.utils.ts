import { matchSingleCollectionRoute } from '@/app/routes';
import { isExternalParentUri } from '@/libs/post/externalParent';
import { removeTracking } from '@/libs/post/linkRules';
import { getAppLinkReference, isRunningHostUrl } from '@/libs/pubkyApp/appLink';
import { isPubkyIdentifier, isValidPostCompositeId } from '@/libs/utils/utils';
import { CompositeIdDomain, type Pubky } from '@/models/models.types';
import { buildCompositeId, buildCompositeIdFromPubkyUri, parsePubkyUri } from '@/models/models.utils';

/** What pasted text adds: a Pubky post, a link (as written), or nothing, with the reason. */
export type AddContentInput =
  { type: 'post'; compositeId: string } | { type: 'link'; uri: string } | { type: 'invalid'; message: string };

const ONLY_POSTS = 'Only Pubky posts can be added.';

/**
 * Reads the text pasted into "Add Post": a Pubky post, by its link on the host the app runs on
 * (`https://…/post/{author}/{id}`, `getAppLinkReference`) or its `pubky://` reference, adds the post;
 * any other web link adds the link, as written but without its tracking parameters (`removeTracking`),
 * as an external resource (a post link on another host included). Refused: text that is no URL, a
 * collection (`/collections/{author}/{id}`), a profile or a post link still being typed on this app's
 * host, and other Pubky objects (a collection lists them as posts, so one that is no post would never
 * show). Runs on every keystroke, so it never throws.
 */
export function parseAddContentInput(value: string): AddContentInput {
  // A phone keyboard may capitalise the scheme (`Https://`): links are spelled with it in lower case.
  const input = value.trim().replace(/^https?:/i, (scheme) => scheme.toLowerCase());

  const appLink = getAppLinkReference(input);
  if (appLink?.kind === 'post') return { type: 'post', compositeId: appLink.compositeId };
  if (appLink) return { type: 'invalid', message: ONLY_POSTS };

  if (parsePubkyUri(input)) {
    const compositeId = buildCompositeIdFromPubkyUri({ uri: input, domain: CompositeIdDomain.POSTS });
    return compositeId && isValidPostCompositeId(compositeId)
      ? { type: 'post', compositeId }
      : { type: 'invalid', message: ONLY_POSTS };
  }

  const url = /^https?:\/\//.test(input) && isExternalParentUri(input) ? toUrl(input) : null;
  if (!url) return { type: 'invalid', message: 'Enter a valid URL.' };
  // A collection or a post link being typed is the app's own route; elsewhere the same path is a link.
  if (!isRunningHostUrl(url)) return { type: 'link', uri: removeTracking(input) };

  const { pathname } = url;
  const collection = matchSingleCollectionRoute(pathname);
  if (
    collection &&
    isValidPostCompositeId(buildCompositeId({ pubky: collection.userId as Pubky, id: collection.postId }))
  ) {
    return { type: 'invalid', message: 'Collection can not be added to a collection.' };
  }

  const segments = pathname.split('/').filter(Boolean);
  if (segments[0] === 'post' && isPubkyIdentifier(segments[1] ?? '')) {
    return { type: 'invalid', message: 'Enter a valid post URL.' };
  }

  return { type: 'link', uri: removeTracking(input) };
}

function toUrl(value: string): URL | null {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}
