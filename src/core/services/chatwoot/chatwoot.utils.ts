import type { TChatwootContact } from './chatwoot.types';
import { ServerErrorCode } from '@/libs/error/error.codes';
import { Err } from '@/libs/error/error.factories';
import { ErrorService } from '@/libs/error/error.types';

/**
 * Email domain for Chatwoot contacts
 */
export const CHATWOOT_EMAIL_DOMAIN = 'pubky.app';

/**
 * Build email address from pubky for Chatwoot contact
 *
 * @param pubky - User's public key
 * @returns Email address in format pubky@pubky.app
 */
export function buildChatwootEmail(pubky: string): string {
  return `${pubky}@${CHATWOOT_EMAIL_DOMAIN}`;
}

/**
 * Extract source ID from contact, validating inbox associations exist
 *
 * Validates that the contact has at least one inbox association and
 * returns the source ID from the first inbox.
 *
 * @param contact - Chatwoot contact object
 * @param email - Email used for error context
 * @returns Source ID from the first inbox association
 * @throws AppError if contact has no inbox associations
 */
export function extractSourceId(contact: TChatwootContact, email: string): string {
  if (!contact.contact_inboxes || contact.contact_inboxes.length === 0) {
    throw Err.server(ServerErrorCode.INVALID_RESPONSE, 'Contact has no inbox associations', {
      service: ErrorService.Chatwoot,
      operation: 'extractSourceId',
      context: { contactId: contact.id, email },
    });
  }
  return contact.contact_inboxes[0].source_id;
}
