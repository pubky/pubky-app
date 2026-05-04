import type { TFeedbackSubmitInput } from './feedback.types';
import { Logger } from '@/libs/logger/logger';
import { AppError } from '@/libs/error/error';
import { ServerErrorCode } from '@/libs/error/error.codes';
import { Err } from '@/libs/error/error.factories';
import { ErrorService } from '@/libs/error/error.types';
import { ChatwootService } from '@/services/chatwoot/chatwoot';
import { CHATWOOT_FEEDBACK_MESSAGE_PREFIX, CHATWOOT_INBOX_IDS } from '@/services/chatwoot/chatwoot.constants';
import { buildChatwootEmail, extractSourceId } from '@/services/chatwoot/chatwoot.utils';
/**
 * Feedback application service.
 *
 * Orchestrates feedback submission workflow:
 * 1. Builds email from pubky
 * 2. Determines inbox ID for feedback
 * 3. Formats message with feedback prefix
 * 4. Calls Chatwoot service to create contact and conversation
 * 5. Logs errors for observability
 *
 * This layer is called by the controller and handles cross-domain orchestration.
 */
export class FeedbackApplication {
  private constructor() {}

  /**
   * Format the full message content with feedback prefix
   *
   * @param comment - User's feedback comment
   * @returns Full formatted message content
   */
  private static formatMessageContent(comment: string): string {
    return `${CHATWOOT_FEEDBACK_MESSAGE_PREFIX}\n\n${comment}`;
  }

  /**
   * Submit feedback to Chatwoot
   *
   * Orchestrates the feedback submission by:
   * 1. Building email from pubky
   * 2. Creating or finding contact in Chatwoot
   * 3. Creating conversation with formatted message
   *
   * @param params - Parameters object
   * @param params.pubky - User's public key
   * @param params.comment - Feedback comment
   * @param params.name - User's display name
   * @throws AppError if submission fails
   */
  static async submit({ pubky, comment, name }: TFeedbackSubmitInput): Promise<void> {
    try {
      // Build email from pubky
      const email = buildChatwootEmail(pubky);

      // Get inbox ID for feedback
      const inboxId = CHATWOOT_INBOX_IDS.FEEDBACK;

      // Format message with prefix
      const content = this.formatMessageContent(comment);

      // Create or find contact in Chatwoot
      const contact = await ChatwootService.createOrFindContact(email, name, inboxId);

      // Extract source ID (validates inbox associations)
      const sourceId = extractSourceId(contact, email);

      // Create conversation with formatted message
      await ChatwootService.createConversation(sourceId, contact.id, inboxId, content);
    } catch (error) {
      // Log error for observability
      if (error instanceof AppError) {
        Logger.error('Feedback submission failed', {
          category: error.category,
          code: error.code,
          service: error.service,
          operation: error.operation,
          context: error.context,
        });
        // Re-throw AppError to preserve error context
        throw error;
      }

      // Wrap unexpected errors
      Logger.error('Unexpected error during feedback submission', { error });
      throw Err.server(ServerErrorCode.UNKNOWN_ERROR, 'Failed to submit feedback', {
        service: ErrorService.Chatwoot,
        operation: 'submit',
        cause: error,
      });
    }
  }
}
