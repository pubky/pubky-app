import * as Types from './copyright.types';
import { ChatwootService } from '@/services/chatwoot/chatwoot';
import { CHATWOOT_INBOX_IDS } from '@/services/chatwoot/chatwoot.constants';
import { extractSourceId } from '@/services/chatwoot/chatwoot.utils';
/**
 * Copyright application service.
 *
 * Orchestrates copyright/DMCA takedown request submission workflow:
 * 1. Uses email from form data (not built from pubky)
 * 2. Determines inbox ID for copyright submissions (28)
 * 3. Formats message with source label and form data as JSON
 * 4. Calls Chatwoot service to create contact and conversation
 * 5. Logs errors for observability
 *
 * This layer is called by the controller and handles cross-domain orchestration.
 */
export class CopyrightApplication {
  private constructor() {}

  /**
   * Source label for copyright submissions
   */
  private static readonly COPYRIGHT_SOURCE_LABEL = 'Copyright Removal Request';

  /**
   * Format form data as JSON string for message body
   */
  private static formatFormData(formData: Types.TCopyrightSubmitInput): string {
    return JSON.stringify(formData, null, 2);
  }

  /**
   * Format the full message content with source label prefix
   */
  private static formatMessageContent(formDataJson: string): string {
    return `${this.COPYRIGHT_SOURCE_LABEL}\n\n${formDataJson}`;
  }

  /**
   * Submit a copyright/DMCA takedown request to Chatwoot
   *
   * @param params - Parameters object with all copyright form fields
   * @throws AppError if submission fails
   */
  static async submit(params: Types.TCopyrightSubmitInput): Promise<void> {
    const email = params.email;
    const inboxId = CHATWOOT_INBOX_IDS.COPYRIGHT;
    const name = `${params.firstName} ${params.lastName}`.trim();

    const formDataJson = this.formatFormData(params);
    const content = this.formatMessageContent(formDataJson);

    const contact = await ChatwootService.createOrFindContact(email, name, inboxId);
    const sourceId = extractSourceId(contact, email);

    await ChatwootService.createConversation(sourceId, contact.id, inboxId, content);
  }
}
