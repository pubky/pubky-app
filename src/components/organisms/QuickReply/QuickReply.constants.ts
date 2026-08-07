/**
 * Approximate gap between the main post card and replies section in pixels.
 * This accounts for the visual spacing in the layout.
 */
const SINGLE_POST_REPLIES_GAP = 50;

/**
 * Height in pixels to account for spacing between main post and QuickReply in connector calculation.
 * The connector needs to extend upward to cover the gap.
 * This ensures the connector properly connects from the main post to QuickReply
 */
export const QUICK_REPLY_CONNECTOR_SPACER_HEIGHT = SINGLE_POST_REPLIES_GAP;

/**
 * Number of prompts available for the quick reply placeholder.
 * This should match the number of prompts in the translations file (messages/en.json -> quickReply.prompts).
 */
export const QUICK_REPLY_PROMPTS_COUNT = 5;
