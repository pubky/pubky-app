import { getUserProfileUrl } from '@/app/routes';

const POST_URI = /^pubky:\/\/([ybndrfg8ejkmcpqxot1uwisza345h769]{52})\/pub\/pubky\.app\/posts\/([^/?#]+)$/;
const PROFILE_URI = /^pubky:\/\/([ybndrfg8ejkmcpqxot1uwisza345h769]{52})\/pub\/pubky\.app\/profile\.json$/;
const OWNER_URI = /^pubky:\/\/([ybndrfg8ejkmcpqxot1uwisza345h769]{52})\/pub\/pubky\.app\//;

/** Map a public `pubky://` evidence URI to an App route. */
export function pubkyUriToAppHref(uri: string, currentUserPubky?: string | null): string | null {
  const post = uri.match(POST_URI);
  if (post) return `/post/${post[1]}/${post[2]}`;
  const profile = uri.match(PROFILE_URI);
  if (profile) return getUserProfileUrl(profile[1], currentUserPubky);
  const owner = uri.match(OWNER_URI);
  if (owner) return getUserProfileUrl(owner[1], currentUserPubky);
  return null;
}
