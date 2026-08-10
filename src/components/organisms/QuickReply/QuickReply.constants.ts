/**
 * Vertical card chrome outside the measured composer content (p-6 plus borders),
 * with a 1px connector overlap at the top and bottom of the card.
 */
export const QUICK_REPLY_CONNECTOR_HEIGHT_OFFSET = 52;

/**
 * Prompts for the quick reply placeholder. One is picked at random per mount.
 */
export const QUICK_REPLY_PROMPTS = [
  'What are your thoughts on this?',
  'What do you think?',
  'Do you agree?',
  'Any additional insights?',
  'How would you respond?',
] as const;

/**
 * Number of prompts available for the quick reply placeholder.
 */
export const QUICK_REPLY_PROMPTS_COUNT = QUICK_REPLY_PROMPTS.length;
