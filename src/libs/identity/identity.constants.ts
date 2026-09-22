/**
 * Regex source for a pubky mention: `pk:` or `pubky` followed by exactly 52
 * lowercase alphanumeric (z-base-32) characters.
 *
 * Lives outside `Identity` so server-only code (metadata / OG image rendering)
 * can share the pattern without pulling the `@synonymdev/pubky` WASM SDK that
 * `Identity` depends on into the server bundle.
 */
const PUBKY_IDENTIFIER_WITH_PREFIX_SOURCE = '(?:pk:|pubky)[a-z0-9]{52}';

/**
 * A standalone mention in running text: a prefixed identifier at the start of
 * the text or after whitespace, so a key glued to other text (a URL path, a
 * word) is left alone. Capture groups: (leading boundary)(mention token).
 * Shared by the app's mention links, notification previews and link-preview
 * metadata so all three agree on what counts as a mention. Global: use it
 * with `matchAll` / `replace`, which do not leak `lastIndex`.
 */
export const MENTION_IN_TEXT_REGEX = new RegExp(`(^|\\s)(${PUBKY_IDENTIFIER_WITH_PREFIX_SOURCE})`, 'g');
