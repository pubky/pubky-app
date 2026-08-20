/**
 * Status labels for predefined status types
 */
export const STATUS_LABELS = {
  available: 'Available',
  away: 'Away',
  vacationing: 'Vacationing',
  working: 'Working',
  traveling: 'Traveling',
  celebrating: 'Celebrating',
  sick: 'Sick',
  noStatus: 'No Status',
  loading: 'Loading',
} as const;

/**
 * Default emojis for predefined status types
 */
export const STATUS_EMOJIS = {
  available: '👋',
  away: '🕓',
  vacationing: '🌴',
  working: '👨‍💻',
  traveling: '✈️',
  celebrating: '🥂',
  sick: '🤒',
  noStatus: '',
  loading: '⏳',
} as const;

/**
 * Default status when none is provided
 */
export const DEFAULT_STATUS = 'noStatus' as const;

/**
 * Emoji regex pattern for extracting emojis from strings.
 *
 * Matches:
 * - Regional indicators (flags): \p{RI}\p{RI}
 * - Extended pictographic emojis with optional modifiers:
 *   - Skin tone modifiers: \p{Emoji_Modifier}
 *   - Variation selectors: \uFE0F
 *   - Zero-width joiners (ZWJ sequences): \u200D
 *
 * Examples covered:
 * - Simple: 😊 🎉
 * - Flags: 🇺🇸 🇬🇧
 * - Skin tones: 👋🏿 👨🏻‍💻
 * - Variation selectors: ☹️ ⚠️
 * - ZWJ sequences: 👨‍💻 👨‍👩‍👧‍👦
 */
export const EMOJI_REGEX =
  /\p{RI}\p{RI}|\p{Extended_Pictographic}(?:\p{Emoji_Modifier}|\uFE0F|\u200D\p{Extended_Pictographic})*/gu;
