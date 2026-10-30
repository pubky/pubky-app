import { parseUri } from 'pubky-social-specs';

/**
 * The URL of a post's head among the URLs a LIST of its directory (`posts/{id}/`) returned: the
 * version with the highest `editId`, which ids compare as plain strings. Entries that are no
 * canonical post version (a foreign file name, a slug-only leaf) are skipped; null when the
 * listing holds no version at all.
 */
export function pickHeadVersion(urls: readonly string[]): string | null {
  let head: { url: string; editId: string } | null = null;
  for (const url of urls) {
    let at: ReturnType<typeof parseUri>;
    try {
      at = parseUri(url);
    } catch {
      continue;
    }
    if (at.kind !== 'post' || at.editId === undefined) continue;
    if (head === null || at.editId > head.editId) head = { url, editId: at.editId };
  }
  return head?.url ?? null;
}
