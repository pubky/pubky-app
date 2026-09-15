/**
 * Regex source for a pubky mention: `pk:` or `pubky` followed by exactly 52
 * lowercase alphanumeric (z-base-32) characters.
 *
 * Lives outside `Identity` so server-only code (metadata / OG image rendering)
 * can share the pattern without pulling the `@synonymdev/pubky` WASM SDK that
 * `Identity` depends on into the server bundle.
 */
export const PUBKY_IDENTIFIER_WITH_PREFIX_SOURCE = '(?:pk:|pubky)[a-z0-9]{52}';
