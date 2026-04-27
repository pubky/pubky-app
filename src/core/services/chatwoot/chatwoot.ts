import * as Types from './chatwoot.types';
import { chatwootApi } from './chatwoot.api';
import { Env } from '@/libs/env/env';
import { HttpMethod, JSON_HEADERS } from '@/libs/http/http.types';
import { parseResponseOrThrow } from '@/libs/http/response.utils';
import { ValidationErrorCode } from '@/libs/error/error.codes';
import { Err } from '@/libs/error/error.factories';
import { httpResponseToError, safeFetch } from '@/libs/error/error.http';
import { ErrorService } from '@/libs/error/error.types';

/**
 * Chatwoot API configuration
 */
type TChatwootConfig = {
  accountId: string;
  headers: {
    api_access_token: string;
    'Content-Type': string;
  };
};

/**
 * Chatwoot service - pure adapter for Chatwoot API operations.
 *
 * This service is a low-level adapter that handles only Chatwoot API calls:
 * - Creating or finding contacts
 * - Creating conversations
 *
 * Business logic (email building, inbox selection, message formatting) belongs
 * in the Application layer (ReportApplication, FeedbackApplication).
 *
 * This service runs on the server and requires server-side environment variables:
 * - BASE_URL_SUPPORT
 * - SUPPORT_API_ACCESS_TOKEN
 * - SUPPORT_ACCOUNT_ID
 */
export class ChatwootService {
  private constructor() {}

  /**
   * Get base Chatwoot configuration from environment variables
   *
   * Validates that all required environment variables are present.
   *
   * @returns Configuration object with accountId and headers
   * @throws AppError if required environment variables are missing
   */
  private static getBaseConfig(): TChatwootConfig {
    const baseUrl = Env.BASE_URL_SUPPORT;
    const apiAccessToken = Env.SUPPORT_API_ACCESS_TOKEN;
    const accountId = Env.SUPPORT_ACCOUNT_ID;

    if (!baseUrl || !apiAccessToken || !accountId) {
      throw Err.validation(ValidationErrorCode.MISSING_FIELD, 'Missing required Chatwoot environment variables', {
        service: ErrorService.Chatwoot,
        operation: 'getBaseConfig',
        context: {
          missing: {
            baseUrl: !baseUrl,
            apiAccessToken: !apiAccessToken,
            accountId: !accountId,
          },
        },
      });
    }

    return {
      accountId,
      headers: {
        api_access_token: apiAccessToken,
        'Content-Type': JSON_HEADERS['Content-Type'],
      },
    };
  }

  /**
   * Create or find existing contact in Chatwoot
   *
   * Searches for an existing contact by email. If found, returns it.
   * Otherwise, creates a new contact with the provided email and name.
   *
   * @param email - Contact email address
   * @param name - Contact display name
   * @param inboxId - Inbox ID to associate contact with
   * @returns Chatwoot contact object
   * @throws AppError if API calls fail
   */
  static async createOrFindContact(email: string, name: string, inboxId: number): Promise<Types.TChatwootContact> {
    const config = this.getBaseConfig();

    // Search for existing contact
    const searchUrl = chatwootApi.searchContact(config.accountId, email);
    const searchResponse = await safeFetch(
      searchUrl,
      { method: HttpMethod.GET, headers: config.headers },
      ErrorService.Chatwoot,
      'searchContact',
    );

    if (!searchResponse.ok) {
      throw httpResponseToError(searchResponse, ErrorService.Chatwoot, 'searchContact', searchUrl);
    }

    const searchData = await parseResponseOrThrow<Types.TChatwootContactSearchResponse>(
      searchResponse,
      ErrorService.Chatwoot,
      'searchContact',
      searchUrl,
    );

    const existingContact = searchData.payload?.find(
      (c) => c.email?.toLowerCase().trim() === email.toLowerCase().trim(),
    );

    if (existingContact) {
      return existingContact;
    }

    // Create new contact if not found
    const createUrl = chatwootApi.createContact(config.accountId);
    const createResponse = await safeFetch(
      createUrl,
      {
        method: HttpMethod.POST,
        headers: config.headers,
        body: JSON.stringify({
          inbox_id: inboxId,
          name,
          email,
        }),
      },
      ErrorService.Chatwoot,
      'createContact',
    );

    if (!createResponse.ok) {
      throw httpResponseToError(createResponse, ErrorService.Chatwoot, 'createContact', createUrl);
    }

    const createData = await parseResponseOrThrow<Types.TChatwootCreateContactResponse>(
      createResponse,
      ErrorService.Chatwoot,
      'createContact',
      createUrl,
    );

    return createData.payload.contact;
  }

  /**
   * Create a conversation in Chatwoot
   *
   * Creates a new conversation with the provided content.
   *
   * @param sourceId - Source ID from contact's inbox association
   * @param contactId - Contact ID
   * @param inboxId - Inbox ID for the conversation
   * @param content - Full message content (already formatted by caller)
   * @throws AppError if API call fails
   */
  static async createConversation(
    sourceId: string,
    contactId: number,
    inboxId: number,
    content: string,
  ): Promise<void> {
    const config = this.getBaseConfig();

    const url = chatwootApi.createConversation(config.accountId);
    const response = await safeFetch(
      url,
      {
        method: HttpMethod.POST,
        headers: config.headers,
        body: JSON.stringify({
          source_id: sourceId,
          inbox_id: inboxId,
          contact_id: contactId,
          message: { content, message_type: 'incoming' },
        }),
      },
      ErrorService.Chatwoot,
      'createConversation',
    );

    if (!response.ok) {
      throw httpResponseToError(response, ErrorService.Chatwoot, 'createConversation', url);
    }
  }
}
