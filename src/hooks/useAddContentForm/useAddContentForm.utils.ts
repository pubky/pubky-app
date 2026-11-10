import { matchSingleCollectionRoute } from '@/app/routes';
import { getDefaultUrl } from '@/config/metadata';
import { isExternalParentUri } from '@/libs/post/externalParent';
import { isPubkyIdentifier, isValidPostCompositeId } from '@/libs/utils/utils';
import { CompositeIdDomain, type Pubky } from '@/models/models.types';
import { buildCompositeId, buildCompositeIdFromPubkyUri, parsePubkyUri } from '@/models/models.utils';
import { parsePostReference } from '@/pipes/post/post.reference';

/** What pasted text adds: a Pubky post, a link (as written), or nothing, with the reason. */
export type AddContentInput =
  { type: 'post'; compositeId: string } | { type: 'link'; uri: string } | { type: 'invalid'; message: string };

/**
 * Reads the text pasted into "Add Post": a Pubky post's link (`https://…/post/{author}/{id}` or its
 * `pubky://` reference) adds the post; any other web link adds the link, as an external resource.
 * Refused: text that is no URL, a collection (`/collections/{author}/{id}`) or a post link still
 * being typed on this app's host (`isAppUrl`), and other Pubky objects (a collection lists them as posts, so one that is no post would
 * never show). Runs on every keystroke, so it never throws.
 */
export function parseAddContentInput(value: string): AddContentInput {
  // A phone keyboard may capitalise the scheme (`Https://`): links are spelled with it in lower case.
  const input = value.trim().replace(/^https?:/i, (scheme) => scheme.toLowerCase());

  const post = parsePostReference(input);
  if (post) return { type: 'post', compositeId: post.compositeId };

  if (parsePubkyUri(input)) {
    const compositeId = buildCompositeIdFromPubkyUri({ uri: input, domain: CompositeIdDomain.POSTS });
    return compositeId && isValidPostCompositeId(compositeId)
      ? { type: 'post', compositeId }
      : { type: 'invalid', message: 'Only Pubky posts can be added.' };
  }

  const url = /^https?:\/\//.test(input) && isExternalParentUri(input) ? toUrl(input) : null;
  if (!url) return { type: 'invalid', message: 'Enter a valid URL.' };
  // A collection or a post link being typed is the app's own route; elsewhere the same path is a link.
  if (!isAppUrl(url)) return { type: 'link', uri: input };

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

  return { type: 'link', uri: input };
}

function toUrl(value: string): URL | null {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

/** Whether `url` is on this app: its canonical host (`getDefaultUrl`) or the host it runs on. */
function isAppUrl(url: URL): boolean {
  const runningHost = typeof window === 'undefined' ? null : window.location.host;
  return url.host === toUrl(getDefaultUrl())?.host || url.host === runningHost;
}
