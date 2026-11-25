/**
 * A standalone mention: `pk:` or `pubky` and 52 lowercase alphanumerics, at the start of the text or after
 * whitespace, so a key glued to a URL or a word is not one. The same tokens the app renders as mentions.
 */
const MENTION = /(?:^|\s)(?:pk:|pubky)([a-z0-9]{52})/g;

/** The keys mentioned in `text`, each once, in order of first appearance. */
export function parseMentions(text: string): string[] {
  const keys = new Set<string>();
  for (const match of text.matchAll(MENTION)) keys.add(match[1]);
  return [...keys];
}
