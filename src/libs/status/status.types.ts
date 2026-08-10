import type { STATUS_LABELS } from './status.constants';

/**
 * Valid predefined status keys
 */
export type StatusKey = keyof typeof STATUS_LABELS;

/**
 * Parsed status result
 */
export interface ParsedStatus {
  /** The emoji representing the status */
  emoji: string;
  /** The text description of the status */
  text: string;
  /** Whether this is a custom user-defined status or a predefined one */
  isCustom: boolean;
  /** The predefined status key (null if custom status) */
  key: StatusKey | null;
}
