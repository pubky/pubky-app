import { AppError } from '@/libs/error/error';
import { ServerErrorCode } from '@/libs/error/error.codes';
import { Err } from '@/libs/error/error.factories';
import { ErrorService } from '@/libs/error/error.types';
import { Logger } from '@/libs/logger/logger';
import { REPORT_ISSUE_LABELS } from '@/pipes/report/report.constants';
import type { ReportIssueType } from '@/pipes/report/report.types';
import { ChatwootService } from '@/services/chatwoot/chatwoot';
import { CHATWOOT_INBOX_IDS, CHATWOOT_REPORT_MESSAGE_PREFIX } from '@/services/chatwoot/chatwoot.constants';
import { buildChatwootEmail, extractSourceId } from '@/services/chatwoot/chatwoot.utils';
import type { TReportSubmitInput } from './report.types';

/**
 * Report application service.
 *
 * Orchestrates report submission workflow:
 * 1. Builds email from pubky
 * 2. Determines inbox ID for reports
 * 3. Formats report message with source label, post URL and issue details
 * 4. Calls Chatwoot service to create contact and conversation
 * 5. Logs errors for observability
 *
 * This layer is called by the controller and handles cross-domain orchestration.
 */
export class ReportApplication {
  private constructor() {}

  /**
   * Build the source label for Chatwoot
   *
   * Creates a formatted source string like "Report Post - Personal Info Leak"
   *
   * @param issueType - Type of issue being reported
   * @returns Formatted source label
   */
  private static buildSourceLabel(issueType: ReportIssueType): string {
    const issueLabel = REPORT_ISSUE_LABELS[issueType];
    return `${CHATWOOT_REPORT_MESSAGE_PREFIX} - ${issueLabel}`;
  }

  /**
   * Build the report comment body
   *
   * Creates a formatted message with post URL and user's reason
   *
   * @param postUrl - URL of the reported post
   * @param reason - User's description of the issue
   * @returns Formatted comment body
   */
  private static buildCommentBody(postUrl: string, reason: string): string {
    return `Post URL: ${postUrl}\n\nReason: ${reason}`;
  }

  /**
   * Format the full message content with source label prefix
   *
   * @param sourceLabel - Source label (e.g., "Report Post - Personal Info Leak")
   * @param commentBody - Comment body with post URL and reason
   * @returns Full formatted message content
   */
  private static formatMessageContent(sourceLabel: string, commentBody: string): string {
    return `${sourceLabel}\n\n${commentBody}`;
  }

  /**
   * Submit a post report to Chatwoot
   *
   * Orchestrates the report submission by:
   * 1. Building email from pubky
   * 2. Building source label and comment body
   * 3. Creating or finding contact in Chatwoot
   * 4. Creating conversation with formatted message
   *
   * @param params - Parameters object
   * @param params.pubky - Reporter's public key
   * @param params.postUrl - URL of the reported post
   * @param params.issueType - Type of issue being reported
   * @param params.reason - User's description of the issue
   * @param params.name - Reporter's display name
   * @throws AppError if submission fails
   */
  static async submit({ pubky, postUrl, issueType, reason, name }: TReportSubmitInput): Promise<void> {
    try {
      // Build email from pubky
      const email = buildChatwootEmail(pubky);

      // Get inbox ID for reports
      const inboxId = CHATWOOT_INBOX_IDS.REPORTS;

      // Build source label and comment body
      const sourceLabel = this.buildSourceLabel(issueType);
      const commentBody = this.buildCommentBody(postUrl, reason);
      const content = this.formatMessageContent(sourceLabel, commentBody);

      // Create or find contact in Chatwoot
      const contact = await ChatwootService.createOrFindContact(email, name, inboxId);

      // Extract source ID (validates inbox associations)
      const sourceId = extractSourceId(contact, email);

      // Create conversation with formatted message
      await ChatwootService.createConversation(sourceId, contact.id, inboxId, content);
    } catch (error) {
      // Log error for observability
      if (error instanceof AppError) {
        Logger.error('Report submission failed', {
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
      Logger.error('Unexpected error during report submission', { error });
      throw Err.server(ServerErrorCode.UNKNOWN_ERROR, 'Could not submit report. Try again.', {
        service: ErrorService.Chatwoot,
        operation: 'submit',
        cause: error,
      });
    }
  }
}
