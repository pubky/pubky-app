import validationLimits from 'pubky-app-specs/validationLimits.json';

/**
 * Regex pattern to match Radix UI generated IDs globally.
 * Used for replacing all occurrences in snapshot serialization.
 *
 * Matches patterns like: "radix-_r_12345", "_r_abc123"
 *
 * @see https://github.com/pubky/pubky-app/issues/1101
 */
export const RADIX_ID_REGEX = /\b(radix-)?_r_[\da-z]+_?\b/gi;

/**
 * Regex pattern to test if a string contains a Radix UI generated ID.
 * Does NOT have the global flag to avoid stateful lastIndex issues with .test().
 *
 * @see https://github.com/pubky/pubky-app/issues/1101
 */
export const RADIX_ID_TEST_REGEX = /\b(radix-)?_r_[\da-z]+_?\b/i;

/**
 * Regex pattern for parsing H:M:S timestamp format.
 * Matches formats: "1h2m3s", "5m30s", "45s", "30" (plain seconds)
 *
 * Pattern breakdown:
 * - `(?:(\d+)h)?` - Optional hours with 'h' suffix
 * - `(?:(\d+)m)?` - Optional minutes with 'm' suffix
 * - `(?:(\d+)s?)?` - Optional seconds with optional 's' suffix
 *
 * @example
 * "1h2m3s".match(HMS_TIMESTAMP_REGEX) // ["1h2m3s", "1", "2", "3"]
 * "30s".match(HMS_TIMESTAMP_REGEX)    // ["30s", undefined, undefined, "30"]
 * "30".match(HMS_TIMESTAMP_REGEX)     // ["30", undefined, undefined, "30"]
 * "5m".match(HMS_TIMESTAMP_REGEX)     // ["5m", undefined, "5", undefined]
 */
export const HMS_TIMESTAMP_REGEX = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s?)?$/;

/**
 * Banned characters for tags per pubky-app-specs.
 * Colons, commas, spaces, tabs, and newlines are not allowed in tags.
 */
const escapeTagCharForRegex = (char: string) => {
  switch (char) {
    case '\t':
      return '\\t';
    case '\n':
      return '\\n';
    case '\r':
      return '\\r';
    default:
      return char.replace(/[\\\-\]\^]/g, '\\$&');
  }
};

export const TAG_BANNED_CHARS = new RegExp(
  `[${validationLimits.tagInvalidChars.map(escapeTagCharForRegex).join('')}]`,
  'g',
);
