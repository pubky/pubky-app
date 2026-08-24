import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import type { SnapshotSerializer } from 'vitest';
import { DEFAULT_DISPLAY_PUBLIC_KEY_LENGTH, TAG_MAX_LENGTH } from '@/config/posts';
import { parseCompositeId } from '@/models/models.utils';
import type { PostInputVariant } from '@/organisms/PostInput/PostInput.types';
import { getSafeExternalUrl } from './safeExternalUrl';
import { RADIX_ID_REGEX, RADIX_ID_TEST_REGEX, TAG_BANNED_CHARS } from './utils.constants';
import type {
  CopyToClipboardProps,
  ExtractInitialsProps,
  FormatPublicKeyProps,
  GetDisplayTagsOptions,
} from './utils.types';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const PUBKY_PREFIX = 'pubky';
const LEGACY_PUBKY_PREFIX = 'pk:';

export function withPubkyPrefix(key: string): string {
  if (!key) return '';
  if (key.startsWith(PUBKY_PREFIX)) return key;
  if (key.startsWith(LEGACY_PUBKY_PREFIX)) {
    return `${PUBKY_PREFIX}${key.slice(LEGACY_PUBKY_PREFIX.length)}`;
  }
  return `${PUBKY_PREFIX}${key}`;
}

export function stripPubkyPrefix(key: string): string {
  if (!key) return '';
  if (key.startsWith(PUBKY_PREFIX)) return key.slice(PUBKY_PREFIX.length);
  if (key.startsWith(LEGACY_PUBKY_PREFIX)) return key.slice(LEGACY_PUBKY_PREFIX.length);
  return key;
}

export function formatPublicKey({
  key,
  length = DEFAULT_DISPLAY_PUBLIC_KEY_LENGTH,
  includePrefix = false,
}: FormatPublicKeyProps) {
  if (!key) return '';
  const rawKey = stripPubkyPrefix(key);
  const prefixLabel = includePrefix ? PUBKY_PREFIX : '';
  if (rawKey.length <= length) return `${prefixLabel}${rawKey}`;
  const prefix = rawKey.slice(0, Math.floor(length / 2));
  const suffix = rawKey.slice(-(length - prefix.length));
  return `${prefixLabel}${prefix}...${suffix}`;
}

/**
 * Resolves a user's display name, falling back to a shortened public key when
 * the profile has no `name` set. Mirrors the app's UI convention
 * (`user.name || formatPublicKey(...)`, e.g. in `UserListItem`).
 */
export function resolveDisplayName(user: { name: string; id: string }): string {
  return user.name || formatPublicKey({ key: user.id });
}

/**
 * Checks if a string is a valid pubky identifier.
 * Pubky identifiers are exactly 52 lowercase alphanumeric characters (z-base-32 encoded).
 *
 * @param value - The string to validate
 * @returns true if the string is a valid pubky identifier
 *
 * @example
 * ```ts
 * isPubkyIdentifier('o1gg96ewuojmopcjbz8895478wdtxtzzber7aezq6ror5a91j7dy') // true
 * isPubkyIdentifier('posts') // false
 * isPubkyIdentifier('ABC123...') // false (uppercase)
 * ```
 */
export function isPubkyIdentifier(value: string): boolean {
  return /^[a-z0-9]{52}$/.test(value);
}

function parseValidPostCompositeId(compositeId: string): { pubky: string; id: string } | null {
  try {
    const { pubky, id } = parseCompositeId(compositeId);
    if (!isPubkyIdentifier(pubky) || id.length === 0) return null;
    return { pubky, id };
  } catch {
    return null;
  }
}

/**
 * True when `compositeId` parses as `author:postId` and `author` is a valid pubky identifier.
 * Used to reject malformed `/post/:userId/:postId` URLs without treating them as a cache miss.
 */
export function isValidPostCompositeId(compositeId: string): boolean {
  return parseValidPostCompositeId(compositeId) !== null;
}

/**
 * Author pubky from `author:postId` when {@link isValidPostCompositeId} is true; otherwise `null`.
 */
export function getValidAuthorPubkyFromPostCompositeId(compositeId: string): string | null {
  return parseValidPostCompositeId(compositeId)?.pubky ?? null;
}

export async function copyToClipboard({ text }: CopyToClipboardProps) {
  if (typeof navigator === 'undefined') {
    throw new Error('Clipboard API not supported');
  }

  let clipboardError: Error | null = null;

  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch (error) {
      clipboardError = error as Error;
    }
  }

  if (typeof document === 'undefined') {
    throw clipboardError ?? new Error('Clipboard API not supported');
  }

  const execCommand = typeof document.execCommand === 'function' ? document.execCommand.bind(document) : null;

  if (!execCommand) {
    throw clipboardError ?? new Error('Clipboard API not supported');
  }

  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'fixed';
  textarea.style.top = '-9999px';
  textarea.style.opacity = '0';

  document.body.appendChild(textarea);

  try {
    textarea.focus();
    textarea.select();

    const successful = execCommand('copy');

    if (!successful) {
      throw new Error('Fallback copy command was unsuccessful');
    }
  } catch (error) {
    throw clipboardError ?? (error as Error);
  } finally {
    document.body.removeChild(textarea);
  }
}

/**
 * Read text from the clipboard. Throws when the Clipboard API is unavailable
 * (non-secure context, unsupported browser) or the read is denied.
 */
export async function readFromClipboard(): Promise<string> {
  if (typeof navigator === 'undefined' || !navigator.clipboard?.readText) {
    throw new Error('Clipboard API not supported');
  }

  return navigator.clipboard.readText();
}

const customCases = [
  { name: 'bitcoin', color: '#FF9900' },
  { name: 'synonym', color: '#FF6600' },
  { name: 'bitkit', color: '#FF4400' },
  { name: 'pubky', color: '#C8FF00' },
  { name: 'blocktank', color: '#FFAE00' },
  { name: 'tether', color: '#26A17B' },
];

/**
 * Generates a consistent color for a given string
 * @param str - The string to generate a color for
 * @returns Hex color string
 */
export function generateRandomColor(str: string): string {
  const lowerStr = str.toLowerCase();

  // Check for cases
  for (const special of customCases) {
    if (lowerStr === special.name) {
      return special.color;
    }
  }

  // Generate a hash value from the input string
  const hash = Array.from(str).reduce((hash, char) => {
    return char.charCodeAt(0) + ((hash << 5) - hash);
  }, 0);

  // Ensure the hash is non-negative
  const positiveHash = Math.abs(hash);

  // Convert hash to a 2-character hex value
  const randomByte = positiveHash & 0xff; // extract the lowest 8 bits
  const randomHex = randomByte.toString(16).padStart(2, '0');

  // Pick a random pattern
  const patterns = [
    `FF00${randomHex}`,
    `FF${randomHex}00`,
    `${randomHex}FF00`,
    `${randomHex}00FF`,
    `00${randomHex}FF`,
    `00FF${randomHex}`,
  ];

  // Select pattern based on the hash
  const pattern = patterns[positiveHash % patterns.length];

  return `#${pattern}`;
}

/**
 * Converts a hex color to rgba format
 * @param hex - Hex color string (e.g., '#FF9900')
 * @param alpha - Alpha value (0-1)
 * @returns RGBA color string
 */
export function hexToRgba(hex: string, alpha: number) {
  const [r, g, b] = hex.match(/\w\w/g)!.map((x) => parseInt(x, 16));
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function extractInitials({ name, maxLength = 2 }: ExtractInitialsProps) {
  if (!name || typeof name !== 'string') return '';

  return name
    .trim()
    .split(/\s+/)
    .filter((word) => word.length > 0)
    .map((word) => word.charAt(0))
    .join('')
    .toUpperCase()
    .slice(0, maxLength);
}

export function formatInviteCode(code: string) {
  if (!code) return '';

  // Remove all non-alphanumeric characters
  const cleaned = code.replace(/[^a-zA-Z0-9]/g, '');

  // Convert to uppercase
  const uppercased = cleaned.toUpperCase();

  // If no valid characters, return empty string
  if (uppercased.length === 0) return '';

  // Handle different lengths
  if (uppercased.length <= 4) {
    return uppercased;
  } else if (uppercased.length <= 8) {
    return `${uppercased.slice(0, 4)}-${uppercased.slice(4)}`;
  } else {
    // Take only first 12 characters for longer codes
    const truncated = uppercased.slice(0, 12);
    return `${truncated.slice(0, 4)}-${truncated.slice(4, 8)}-${truncated.slice(8, 12)}`;
  }
}

export function clearCookies() {
  if (typeof document !== 'undefined') {
    document.cookie.split(';').forEach((cookie) => {
      const eqPos = cookie.indexOf('=');
      const name = eqPos > -1 ? cookie.substr(0, eqPos) : cookie;
      document.cookie = `${name.trim()}=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/`;
    });
  }
}

/**
 * Pauses execution for the specified duration.
 * Useful for adding delays in async operations.
 *
 * @param ms - Duration to sleep in milliseconds
 * @returns Promise that resolves after the specified duration
 *
 * @example
 * await sleep(1000); // Wait 1 second
 * await sleep(5000); // Wait 5 seconds
 */
export const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Helper functions to create timestamps relative to now
 */
export const minutesAgo = (mins: number): number => Date.now() - mins * 60 * 1000;
export const hoursAgo = (hours: number): number => Date.now() - hours * 60 * 60 * 1000;
export const daysAgo = (days: number): number => Date.now() - days * 24 * 60 * 60 * 1000;

/**
 * Formats a filename by truncating it if it exceeds the max length,
 * preserving the file extension
 * @param filename - The filename to format
 * @param maxLength - Maximum length for the filename (default: 18)
 * @returns Formatted filename with ellipsis if truncated
 */
export function formatFileName(filename: string, maxLength = 18): string {
  if (filename.length <= maxLength) {
    return filename;
  }

  const extensionIndex = filename.lastIndexOf('.');
  if (extensionIndex <= 0) {
    return `${filename.slice(0, maxLength - 1)}…`;
  }

  const extension = filename.slice(extensionIndex);
  const baseLength = maxLength - extension.length - 1;

  if (baseLength <= 0) {
    return `${filename.slice(0, maxLength - 1)}…`;
  }

  return `${filename.slice(0, baseLength)}…${extension}`;
}

/**
 * Truncates a string to a maximum length and appends an ellipsis if truncated.
 * @param str - The string to truncate
 * @param maxLength - Maximum length of the string
 * @returns Truncated string with "..." at the end
 *
 * @example
 * truncateString("Short text", 20) // "Short text"
 * truncateString("Very long text that needs truncation", 20) // "Very long text that ..."
 */
export function truncateString(str: string, maxLength: number): string {
  if (!str) return '';
  if (str.length <= maxLength) return str;
  return `${str.slice(0, maxLength)}...`;
}

/**
 * Truncates a string with "..." in the middle to fit a maximum length
 * Preserves the beginning and end of the string
 *
 * @param str - The string to truncate
 * @param maxLength - Maximum length of the string
 * @returns Truncated string with "..." in the middle
 *
 * @example
 * truncateMiddle("https://example.com/short", 80) // "https://example.com/short"
 * truncateMiddle("https://example.com/very/long/path/to/page", 30) // "https://exa...to/page"
 * truncateMiddle("VeryLongFileName.pdf", 15) // "VeryLon...e.pdf"
 */
export function truncateMiddle(str: string, maxLength: number): string {
  if (!str) return '';
  if (str.length <= maxLength) return str;

  // Calculate how many chars to keep on each side
  const ellipsis = '...';
  const charsToKeep = maxLength - ellipsis.length;
  const charsStart = Math.ceil(charsToKeep / 2);
  const charsEnd = Math.floor(charsToKeep / 2);

  return str.slice(0, charsStart) + ellipsis + str.slice(-charsEnd);
}

/**
 * Decode HTML entities to their corresponding characters
 * Handles common entities like &amp;, &quot;, &#039;, etc.
 *
 * @param text - The text containing HTML entities
 * @returns Text with decoded HTML entities
 *
 * @example
 * decodeHtmlEntities("l&#039;usage") // "l'usage"
 * decodeHtmlEntities("Test &quot;quotes&quot; &amp; symbols") // 'Test "quotes" & symbols'
 */
export function decodeHtmlEntities(text: string): string {
  const entities: Record<string, string> = {
    '&amp;': '&',
    '&lt;': '<',
    '&gt;': '>',
    '&quot;': '"',
    '&#039;': "'",
    '&#39;': "'",
    '&apos;': "'",
    '&nbsp;': ' ',
  };

  return text.replace(/&[#\w]+;/g, (entity) => {
    // First check named entities
    if (entities[entity]) {
      return entities[entity];
    }

    // Handle numeric entities like &#39; or &#x27;
    if (entity.startsWith('&#x')) {
      const code = parseInt(entity.slice(3, -1), 16);
      return String.fromCharCode(code);
    } else if (entity.startsWith('&#')) {
      const code = parseInt(entity.slice(2, -1), 10);
      return String.fromCharCode(code);
    }

    // If we don't recognize it, return as-is
    return entity;
  });
}

/**
 * Convert hours, minutes, and seconds to total seconds
 * Used by video providers to parse timestamps
 *
 * @param hours - Number of hours (can be undefined or string)
 * @param minutes - Number of minutes (can be undefined or string)
 * @param seconds - Number of seconds (can be undefined or string)
 * @returns Total seconds as a number, or null if any value is invalid (NaN)
 *
 * @security Defense in Depth
 * While regex validation should prevent malformed input, this function guards
 * against NaN propagation by returning null for invalid values. This prevents
 * silent failures where NaN could corrupt calculations downstream.
 *
 * @example
 * convertHmsToSeconds('1', '2', '3') // 3723 (1h 2m 3s)
 * convertHmsToSeconds(undefined, '5', '30') // 330 (5m 30s)
 * convertHmsToSeconds(undefined, undefined, '45') // 45 (45s)
 * convertHmsToSeconds('abc', '2', '3') // null (invalid input)
 */
export const convertHmsToSeconds = (
  hours: string | undefined,
  minutes: string | undefined,
  seconds: string | undefined,
): number | null => {
  const h = parseInt(hours || '0', 10);
  const m = parseInt(minutes || '0', 10);
  const s = parseInt(seconds || '0', 10);

  // Guard against NaN propagation (defense in depth)
  if (isNaN(h) || isNaN(m) || isNaN(s)) {
    return null;
  }

  return h * 3600 + m * 60 + s;
};

export const isPostDeleted = (content: string | undefined) => content === '[DELETED]';

/**
 * Get tags that fit within the character budget.
 * Shows fewer tags if they would exceed the total character limit.
 *
 * @param tags - Array of tag labels to filter
 * @param options - Configuration options for limiting tags
 * @returns Array of tags that fit within the constraints
 *
 * @example
 * ```ts
 * const tags = ['javascript', 'typescript', 'react', 'nodejs'];
 * getDisplayTags(tags); // ['javascript', 'typescript'] - limited by total chars
 * getDisplayTags(tags, { maxCount: 2 }); // ['javascript', 'typescript']
 * getDisplayTags(tags, { maxTotalChars: 50 }); // More tags fit
 * ```
 */
export function getDisplayTags(tags: string[], options: GetDisplayTagsOptions = {}): string[] {
  const { maxTagLength = 10, maxTotalChars = 24, maxCount = 3 } = options;

  if (tags.length === 0) return [];

  const result: string[] = [];
  let totalChars = 0;

  for (const tag of tags) {
    if (result.length >= maxCount) break;

    // Calculate effective length (truncated if needed)
    const effectiveLength = Math.min(tag.length, maxTagLength);

    // Check if adding this tag would exceed the budget
    if (totalChars + effectiveLength > maxTotalChars && result.length > 0) {
      break;
    }

    result.push(tag);
    totalChars += effectiveLength;
  }

  return result;
}

/**
 * Protocol schemes that bypass the confirmation dialog
 */
const BYPASS_PROTOCOLS = ['mailto:', 'tel:'];

/**
 * Checks if a safe external URL is on the same domain as the current page.
 * Compares hostnames while ignoring the 'www.' prefix.
 * Unsupported URL schemes always return false.
 *
 * @param url - The URL to check
 * @returns true if the URL is on the same domain, false otherwise
 *
 * @example
 * ```ts
 * // Current page: https://example.com
 * isSameDomain('https://example.com/page') // true
 * isSameDomain('https://www.example.com/page') // true
 * isSameDomain('https://other-domain.com') // false
 * ```
 */
export function isSameDomain(url: string): boolean {
  try {
    const safeUrl = getSafeExternalUrl(url);
    if (!safeUrl) return false;

    // Parse the validated URL to check
    const urlObj = new URL(safeUrl);
    const urlHostname = urlObj.hostname.toLowerCase().replace(/^www\./, '');

    // Get current page hostname
    const currentHostname = window.location.hostname.toLowerCase().replace(/^www\./, '');

    // Compare hostnames (ignoring www prefix)
    return urlHostname === currentHostname;
  } catch {
    // If URL parsing fails, assume it's not the same domain
    return false;
  }
}

/**
 * Determines if a link should bypass the confirmation dialog and open directly.
 * Unsupported or malformed URLs never bypass confirmation.
 * Returns true if:
 * - The URL uses a bypass protocol (mailto, tel, etc.)
 * - The URL is on the same domain as the current page
 *
 * @param url - The URL to check
 * @returns true if the link should open directly without confirmation, false otherwise
 *
 * @example
 * ```ts
 * // Current page: https://example.com
 * shouldBypassLinkConfirmation('mailto:test@example.com') // true
 * shouldBypassLinkConfirmation('tel:+1234567890') // true
 * shouldBypassLinkConfirmation('https://example.com/page') // true
 * shouldBypassLinkConfirmation('https://other-domain.com') // false
 * ```
 */
export function shouldBypassLinkConfirmation(url: string): boolean {
  const safeUrl = getSafeExternalUrl(url);
  if (!safeUrl) return false;

  // Check if URL uses a bypass protocol (mailto, tel, etc.)
  const protocol = new URL(safeUrl).protocol;
  if (BYPASS_PROTOCOLS.includes(protocol)) {
    return true;
  }

  // Check if URL is on the same domain
  return isSameDomain(safeUrl);
}

/**
 * Count characters properly (grapheme-aware)
 * Uses Array.from() to handle emojis and Unicode correctly.
 * Standard string.length counts UTF-16 code units, which makes
 * emojis like 👍 count as 2 instead of 1.
 *
 * @param text - The string to count characters in
 * @returns The number of grapheme characters
 *
 * @example
 * getCharacterCount('Hello') // 5
 * getCharacterCount('👍') // 1 (instead of 2 with .length)
 * getCharacterCount('Hello 👍') // 7
 */
export function getCharacterCount(text: string): number {
  return Array.from(text).length;
}

/**
 * Remove banned characters from tag input
 * Used to sanitize tag input on every keystroke and paste
 *
 * @param value - The raw input value
 * @returns The sanitized value with banned characters removed
 *
 * @example
 * sanitizeTagInput('hello:world') // 'helloworld'
 * sanitizeTagInput('tag, test') // 'tagtest'
 * sanitizeTagInput('valid-tag') // 'valid-tag'
 */
export function sanitizeTagInput(value: string): string {
  return value.replace(TAG_BANNED_CHARS, '');
}

/**
 * Checks whether a string is a valid tag label (correct length, no banned characters).
 *
 * @param value - The candidate tag label (should already be trimmed/lowercased)
 * @returns true when the label satisfies all tag constraints
 */
export function isValidTagLabel(value: string): boolean {
  const charCount = getCharacterCount(value);
  return charCount > 0 && charCount <= TAG_MAX_LENGTH && sanitizeTagInput(value) === value;
}

/**
 * Determines if a post can be submitted based on variant, content, attachments, submission state, and article options.
 *
 * @param variant - The post input variant ('post', 'reply', 'repost', or 'edit')
 * @param content - The text content of the post
 * @param attachments - Array of attached files
 * @param isSubmitting - Whether a submission is currently in progress
 * @param isArticle - Whether the post is an article (optional)
 * @param articleTitle - The title of the article (optional)
 * @returns true if the post can be submitted, false otherwise
 *
 * @remarks
 * - Reposts allow empty content
 * - Posts and replies require either content or attachments
 * - Articles require both content and title
 * - Cannot submit if already submitting
 *
 * @example
 * canSubmitPost('post', 'Hello world', [], false) // true
 * canSubmitPost('post', '', [], false) // false
 * canSubmitPost('repost', '', [], false) // true
 * canSubmitPost('post', 'Hello', [], true) // false (submitting)
 * canSubmitPost('post', 'Content', [], false, true, 'Title') // true (article)
 * canSubmitPost('post', 'Content', [], false, true, '') // false (article without title)
 */
export function canSubmitPost(
  variant: PostInputVariant,
  content: string,
  attachments: File[],
  isSubmitting: boolean,
  isArticle?: boolean,
  articleTitle?: string,
): boolean {
  if (isSubmitting) return false;

  // Reposts allow empty content, posts and replies require content or attachments
  if (variant === 'repost') return true;

  // Articles require both content and title
  if (isArticle) {
    return !!content.trim() && !!articleTitle?.trim();
  }

  // Edit mode requires content to submit
  if (variant === 'edit') return !!content.trim();

  return Boolean(content.trim()) || attachments.length > 0;
}

/**
 * Formats a date to US locale format (MM/DD/YYYY)
 *
 * @param date - The date to format (defaults to current date)
 * @returns Formatted date string in MM/DD/YYYY format
 *
 * @example
 * formatUSDate() // "01/15/2026" (current date)
 * formatUSDate(new Date('2024-12-25')) // "12/25/2024"
 */
export function formatUSDate(date: Date = new Date()): string {
  return date.toLocaleDateString('en-US', {
    month: '2-digit',
    day: '2-digit',
    year: 'numeric',
  });
}

/**
 * Word lists for random username generation
 * Format: Adjective-Noun-Noun (e.g., "Blue-Rabbit-Hat")
 */
const USERNAME_ADJECTIVES = [
  'Blue',
  'Red',
  'Green',
  'Golden',
  'Silver',
  'Purple',
  'Orange',
  'Pink',
  'Cosmic',
  'Bright',
  'Swift',
  'Noble',
  'Brave',
  'Calm',
  'Bold',
  'Wild',
  'Wise',
  'Lucky',
  'Happy',
  'Sunny',
  'Misty',
  'Rusty',
  'Dusty',
  'Frosty',
  'Mighty',
  'Gentle',
  'Clever',
  'Silent',
  'Ancient',
  'Mystic',
];

const USERNAME_NOUNS = [
  'Rabbit',
  'Fox',
  'Wolf',
  'Bear',
  'Eagle',
  'Hawk',
  'Owl',
  'Tiger',
  'Lion',
  'Panda',
  'Koala',
  'Dolphin',
  'Falcon',
  'Phoenix',
  'Dragon',
  'Raven',
  'Sparrow',
  'Otter',
  'Badger',
  'Lynx',
  'Hat',
  'Star',
  'Moon',
  'Sun',
  'Cloud',
  'Storm',
  'Wave',
  'Stone',
  'Crystal',
  'Flame',
  'Frost',
  'Wind',
  'Thunder',
  'Shadow',
  'Light',
  'Blade',
  'Shield',
  'Crown',
  'Tower',
  'Garden',
];

/**
 * Generates a random username in the format "Adjective-Noun-Noun"
 * Creates unique, memorable usernames like "Blue-Rabbit-Hat" or "Golden-Eagle-Star"
 *
 * @returns A random username string
 *
 * @example
 * generateRandomUsername() // "Blue-Rabbit-Hat"
 * generateRandomUsername() // "Golden-Eagle-Star"
 * generateRandomUsername() // "Swift-Fox-Moon"
 */
export function generateRandomUsername(): string {
  const randomAdjective = USERNAME_ADJECTIVES[Math.floor(Math.random() * USERNAME_ADJECTIVES.length)];
  const randomNoun1 = USERNAME_NOUNS[Math.floor(Math.random() * USERNAME_NOUNS.length)];

  // Ensure second noun is different from the first
  let randomNoun2 = USERNAME_NOUNS[Math.floor(Math.random() * USERNAME_NOUNS.length)];
  while (randomNoun2 === randomNoun1) {
    randomNoun2 = USERNAME_NOUNS[Math.floor(Math.random() * USERNAME_NOUNS.length)];
  }

  return `${randomAdjective}-${randomNoun1}-${randomNoun2}`;
}

const FOCUSABLE_SELECTOR = 'button,a[href],[tabindex]:not([tabindex="-1"])';
// Feed cards (`[role="article"]` in grid/list layouts) and visual-mosaic cells
// (`[data-grid-item]` — the tiles are `role="button"`, not articles).
const GRID_ITEM_SELECTOR = '[role="article"],[data-grid-item]';

function isFocusCandidate(element: HTMLElement): boolean {
  return !element.matches(':disabled') && element.closest('[hidden],[aria-hidden="true"]') === null;
}

function findFocusTarget(item: HTMLElement): HTMLElement | null {
  if (item.matches(FOCUSABLE_SELECTOR) && isFocusCandidate(item)) return item;
  for (const candidate of item.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)) {
    if (isFocusCandidate(candidate)) return candidate;
  }
  return null;
}

/**
 * Moves keyboard focus to the adjacent feed card before the current card is
 * removed from the DOM.
 *
 * Used by collection/bookmarks Remove CTAs on deleted or missing posts: the
 * Remove button is about to unmount with its card, so without this hand-off
 * focus would fall to `document.body` (or disappear), which breaks keyboard
 * and screen-reader navigation through the grid. The current card is the
 * closest grid item (`[role="article"]` card or `[data-grid-item]` mosaic
 * cell). Siblings are scanned outward — all following, then all preceding, so
 * non-focusable neighbors (spacers, sentinels) don't dead-end the hand-off —
 * and disabled or hidden elements are never focused. Each sibling yields the
 * item itself when focusable, otherwise its first focusable descendant.
 */
export function focusAdjacentGridItem(button: HTMLButtonElement): void {
  const currentItem = button.closest<HTMLElement>(GRID_ITEM_SELECTOR);
  if (!currentItem) return;

  for (let sibling = currentItem.nextElementSibling; sibling; sibling = sibling.nextElementSibling) {
    if (!(sibling instanceof HTMLElement)) continue;
    const target = findFocusTarget(sibling);
    if (target) {
      target.focus();
      return;
    }
  }
  for (let sibling = currentItem.previousElementSibling; sibling; sibling = sibling.previousElementSibling) {
    if (!(sibling instanceof HTMLElement)) continue;
    const target = findFocusTarget(sibling);
    if (target) {
      target.focus();
      return;
    }
  }
}

/**
 * Snapshot serializer to normalize Radix UI generated IDs.
 * This ensures snapshot tests are consistent across test runs by replacing
 * dynamic Radix IDs (e.g., "radix-_r_12345") with a normalized placeholder.
 *
 * @see https://github.com/pubky/pubky-app/issues/1101
 *
 * @example
 * // In test setup (e.g., vitest.setup.ts):
 * import { radixIdSerializer } from '@/libs/utils/utils';
 * expect.addSnapshotSerializer(radixIdSerializer);
 */
export const radixIdSerializer: SnapshotSerializer = {
  test: (val): val is string => typeof val === 'string' && RADIX_ID_TEST_REGEX.test(val),
  serialize: (val, config, indentation, depth, refs, printer) => {
    const normalized = (val as string).replace(RADIX_ID_REGEX, 'radix-normalized');
    return printer(normalized, config, indentation, depth, refs);
  },
};
