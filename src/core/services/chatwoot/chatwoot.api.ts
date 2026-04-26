import { Env } from '@/libs/env/env';

/**
 * Chatwoot API Endpoints
 *
 * All API endpoints related to Chatwoot operations.
 * URL construction only - fetch logic is in chatwoot.ts
 */

/**
 * Builds a full Chatwoot API URL from a relative endpoint path
 * @param accountId - The Chatwoot account ID
 * @param endpoint - The relative endpoint path (e.g., '/contacts/search')
 * @returns Full Chatwoot URL
 */
function buildChatwootUrl(accountId: string, endpoint: string): string {
  const baseUrl = Env.BASE_URL_SUPPORT;
  return new URL(`/api/v1/accounts/${accountId}${endpoint}`, baseUrl).toString();
}

export const chatwootApi = {
  /**
   * Search for contacts by email
   * @param accountId - Chatwoot account ID
   * @param email - Email address to search for
   */
  searchContact: (accountId: string, email: string) => {
    const url = buildChatwootUrl(accountId, '/contacts/search');
    return `${url}?${new URLSearchParams({ q: email }).toString()}`;
  },

  /**
   * Create a new contact
   * @param accountId - Chatwoot account ID
   */
  createContact: (accountId: string) => buildChatwootUrl(accountId, '/contacts'),

  /**
   * Create a new conversation
   * @param accountId - Chatwoot account ID
   */
  createConversation: (accountId: string) => buildChatwootUrl(accountId, '/conversations'),
};

export type ChatwootApiEndpoint = keyof typeof chatwootApi;
