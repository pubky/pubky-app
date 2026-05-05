import { DEFAULT_STATUS, EMOJI_REGEX, STATUS_EMOJIS, STATUS_LABELS } from './status.constants';
import type { ParsedStatus, StatusKey } from './status.types';

/**
 * Extracts the first emoji from a string
 * @param status - The string to extract emoji from
 * @returns The first emoji found, or null if none
 */
function extractEmoji(status: string): string | null {
  const match = status.match(EMOJI_REGEX);
  return match ? match[0] : null;
}

/**
 * Parses a status string into its emoji and text components
 * Handles predefined statuses (e.g., "vacationing"), custom statuses with emoji (e.g., "🎉 Birthday!"),
 * and text-only custom statuses (e.g., "Working hard")
 *
 * @param status - The status string to parse
 * @param defaultEmoji - Fallback emoji if none found (defaults to noStatus emoji)
 * @returns Parsed status object with emoji, text, and isCustom flag
 *
 * @example
 * // Predefined status
 * parseStatus('vacationing')
 * // => { emoji: '🌴', text: 'Vacationing', isCustom: false }
 *
 * @example
 * // Custom status with emoji
 * parseStatus('🎉 Birthday!')
 * // => { emoji: '🎉', text: 'Birthday!', isCustom: true }
 *
 * @example
 * // Text-only custom status (no emoji)
 * parseStatus('Working hard')
 * // => { emoji: '', text: 'Working hard', isCustom: true }
 */
export function parseStatus(status: string, defaultEmoji: string = STATUS_EMOJIS[DEFAULT_STATUS]): ParsedStatus {
  if (!status) {
    return {
      emoji: STATUS_EMOJIS[DEFAULT_STATUS],
      text: STATUS_LABELS[DEFAULT_STATUS],
      isCustom: false,
      key: DEFAULT_STATUS,
    };
  }

  const emoji = extractEmoji(status);
  if (emoji) {
    return {
      emoji,
      text: status.replace(EMOJI_REGEX, '').trim() || STATUS_LABELS.noStatus,
      isCustom: true,
      key: null,
    };
  }

  // Check if it's a predefined status key
  const statusKey = status as StatusKey;
  const isPredefined = statusKey in STATUS_LABELS;

  if (isPredefined) {
    return {
      emoji: STATUS_EMOJIS[statusKey] || defaultEmoji,
      text: STATUS_LABELS[statusKey],
      isCustom: false,
      key: statusKey,
    };
  }

  // Text-only custom status - no emoji
  return {
    emoji: '',
    text: status,
    isCustom: true,
    key: null,
  };
}

/**
 * Extracts just the emoji from a status string for display purposes (e.g., badge)
 * Uses defaultEmoji as fallback when status doesn't determine an emoji
 *
 * @param status - The status string to extract emoji from
 * @param defaultEmoji - Fallback emoji if none found (defaults to vacationing emoji)
 * @returns The emoji string (uses defaultEmoji for text-only statuses)
 *
 * @example
 * extractEmojiFromStatus('vacationing')
 * // => '🌴'
 *
 * @example
 * extractEmojiFromStatus('🎉 Birthday!')
 * // => '🎉'
 *
 * @example
 * extractEmojiFromStatus('Working hard', '🎯')
 * // => '🎯' (uses fallback for text-only status)
 */
export function extractEmojiFromStatus(status: string, defaultEmoji: string = STATUS_EMOJIS[DEFAULT_STATUS]): string {
  if (!status) {
    return STATUS_EMOJIS[DEFAULT_STATUS];
  }

  const emoji = extractEmoji(status);
  if (emoji) {
    return emoji;
  }

  // Check if it's a predefined status key
  const statusKey = status as StatusKey;
  const isPredefined = statusKey in STATUS_LABELS;

  if (isPredefined) {
    return STATUS_EMOJIS[statusKey] || defaultEmoji;
  }

  // Text-only custom status - use fallback emoji for display purposes
  return defaultEmoji;
}
