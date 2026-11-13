'use client';

import { useSearchParams } from 'next/navigation';
import { getMaxStreamTags } from '@/libs/runtime-config/runtime-config';
import { validateContentSearchQuery } from '@/libs/search/contentSearch';
import { canonicalizeTagLabel } from '@/libs/utils/utils';
import { classifyResourceSearchInput, hasCredentialLink } from '@/pipes/resource/resource.search';

const CREDENTIAL_LINK_MESSAGE = 'Search cannot hold a link with a username or password';

/**
 * Parses tags from a comma-separated string parameter.
 * Trims whitespace, lowercases (tags are case-insensitive everywhere else:
 * store writes, stream requests, chip rendering), filters empty values, and
 * limits to MAX_STREAM_TAGS.
 *
 * @param tagsParam - The raw tags parameter from URL (e.g., "pubky, Bitcoin, nostr")
 * @returns Array of parsed tag strings
 */
function parseTags(tagsParam: string | null): string[] {
  if (!tagsParam || tagsParam.trim() === '') {
    return [];
  }

  return (
    tagsParam
      .split(',')
      // The stored label fold (trim + ASCII lowercase): a search for a tag must name the tag file as written
      .map((tag) => canonicalizeTagLabel(tag))
      .filter((tag) => tag.length > 0)
      .slice(0, getMaxStreamTags())
  );
}

/**
 * The single source of truth for what the search page is searching for.
 *
 * Precedence: a non-empty `?q=` param wins over `?tags=` — including when it is
 * invalid (`mode: 'invalid'`), so a shared over-limit URL surfaces why the search
 * was dropped instead of silently falling back to tag results.
 */
export type SearchCriteria =
  | { mode: 'content'; query: string }
  | { mode: 'tags'; tags: string[] }
  // `query` carries the rejected input so the UI can offer it for editing.
  | { mode: 'invalid'; message: string; query: string }
  // A link or an identifier no post search takes (too long for one): external resources only.
  | { mode: 'resource'; query: string; input: { kind: 'url'; url: string } | { kind: 'key'; key: string } }
  | { mode: 'none' };

/**
 * NOTE: the returned object's identity is only stable where the React Compiler
 * memoizes (the app build) — never rely on it in effect dependencies; derive
 * primitive values instead (see SearchInput's URL-sync effect).
 */
export function useSearchCriteria(): SearchCriteria {
  const searchParams = useSearchParams();
  const query = searchParams.get('q');

  // A blank q carries no intended search; fall through to tags.
  if (query !== null && query.trim() !== '') {
    const validation = validateContentSearchQuery(query);
    // A link that carries credentials (`user:password@`) is never sent as a post search: as a link it
    // goes to the external resources search, which does not send it either; a text holding one is refused
    const holdsCredentialLink = hasCredentialLink(query);
    if (validation.isValid && !holdsCredentialLink) return { mode: 'content', query: validation.query };
    const input = classifyResourceSearchInput(query);
    if (input.kind !== 'text') return { mode: 'resource', query: query.trim(), input };
    const message = validation.isValid ? CREDENTIAL_LINK_MESSAGE : validation.message;
    return { mode: 'invalid', message, query: query.trim() };
  }

  const tags = parseTags(searchParams.get('tags'));
  return tags.length > 0 ? { mode: 'tags', tags } : { mode: 'none' };
}
