import { parseUri } from 'pubky-social-specs';

/**
 * The post version a listed URL names, or null for an entry that is no canonical post version
 * (a foreign file name, a slug-only leaf, a directory, no URI at all).
 */
function parsePostVersion(url: string): { url: string; id: string; editId: string } | null {
  let at: ReturnType<typeof parseUri>;
  try {
    at = parseUri(url);
  } catch {
    return null;
  }
  return at.kind === 'post' && at.editId !== undefined ? { url, id: at.id, editId: at.editId } : null;
}

/**
 * The URL of a post's head among the URLs a LIST of its directory (`posts/{id}/`) returned: the
 * version with the highest `editId`, which ids compare as plain strings. Entries that are no
 * canonical post version (a foreign file name, a slug-only leaf) are skipped; null when the
 * listing holds no version at all.
 */
export function pickHeadVersion(urls: readonly string[]): string | null {
  let head: { url: string; editId: string } | null = null;
  for (const url of urls) {
    const version = parsePostVersion(url);
    if (version && (head === null || version.editId > head.editId)) head = version;
  }
  return head?.url ?? null;
}

/**
 * The URLs among a LIST of a post's directory (`posts/{id}/`, public or private) that are a
 * canonical post version, in listing order. Entries that are no post version are skipped, as
 * `pickHeadVersion` skips them: `deletionPaths` refuses a listing that holds one.
 */
export function pickPostVersions(urls: readonly string[]): string[] {
  return urls.flatMap((url) => parsePostVersion(url)?.url ?? []);
}

/**
 * The ids of the posts a LIST of an owner's `posts/` directory found: every post with at least
 * one canonical version, once, in listing order. Entries that are no post version are skipped,
 * as `pickHeadVersion` skips them.
 */
export function pickListedPostIds(urls: readonly string[]): string[] {
  return [...new Set(urls.flatMap((url) => parsePostVersion(url)?.id ?? []))];
}
