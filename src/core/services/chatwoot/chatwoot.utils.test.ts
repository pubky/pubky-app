import { describe, it, expect } from 'vitest';
import { buildChatwootEmail, extractSourceId, CHATWOOT_EMAIL_DOMAIN } from './chatwoot.utils';
import type { TChatwootContact } from './chatwoot.types';
import { asInvalid } from '@/test-utils/type-assertions';

const testData = {
  pubky: 'o1gg96ewuojmopcjbz8895478wdtxtzzuxnfjjz8o8e77csa1ngo',
  contactId: 456,
  sourceId: 'source-123',
};

const createMockContact = (overrides: Partial<TChatwootContact> = {}): TChatwootContact => ({
  id: testData.contactId,
  email: `${testData.pubky}@${CHATWOOT_EMAIL_DOMAIN}`,
  name: 'Test User',
  contact_inboxes: [
    {
      source_id: testData.sourceId,
    },
  ],
  ...overrides,
});

describe('chatwoot.utils', () => {
  describe('buildChatwootEmail', () => {
    it('should build email with pubky.app domain', () => {
      const email = buildChatwootEmail(testData.pubky);

      expect(email).toBe(`${testData.pubky}@${CHATWOOT_EMAIL_DOMAIN}`);
    });

    it('should handle different pubky values', () => {
      const shortPubky = 'abc123';
      const email = buildChatwootEmail(shortPubky);

      expect(email).toBe(`${shortPubky}@${CHATWOOT_EMAIL_DOMAIN}`);
    });

    it('should use the correct email domain constant', () => {
      expect(CHATWOOT_EMAIL_DOMAIN).toBe('pubky.app');
    });
  });

  describe('extractSourceId', () => {
    it('should extract source ID from contact with inbox associations', () => {
      const contact = createMockContact();
      const email = `${testData.pubky}@${CHATWOOT_EMAIL_DOMAIN}`;

      const sourceId = extractSourceId(contact, email);

      expect(sourceId).toBe(testData.sourceId);
    });

    it('should return first inbox source ID when multiple inboxes exist', () => {
      const firstSourceId = 'first-source';
      const contact = createMockContact({
        contact_inboxes: [{ source_id: firstSourceId }, { source_id: 'second-source' }],
      });
      const email = `${testData.pubky}@${CHATWOOT_EMAIL_DOMAIN}`;

      const sourceId = extractSourceId(contact, email);

      expect(sourceId).toBe(firstSourceId);
    });

    it('should throw AppError when contact has empty inbox associations', () => {
      const contact = createMockContact({ contact_inboxes: [] });
      const email = `${testData.pubky}@${CHATWOOT_EMAIL_DOMAIN}`;

      expect(() => extractSourceId(contact, email)).toThrow('Contact has no inbox associations');
    });

    it('should throw AppError when contact has undefined inbox associations', () => {
      const contact = asInvalid<TChatwootContact>({
        id: testData.contactId,
        email: `${testData.pubky}@${CHATWOOT_EMAIL_DOMAIN}`,
        name: 'Test User',
        contact_inboxes: undefined,
      });
      const email = `${testData.pubky}@${CHATWOOT_EMAIL_DOMAIN}`;

      expect(() => extractSourceId(contact, email)).toThrow('Contact has no inbox associations');
    });

    it('should include contactId and email in error context', () => {
      const contact = createMockContact({ contact_inboxes: [] });
      const email = `${testData.pubky}@${CHATWOOT_EMAIL_DOMAIN}`;

      try {
        extractSourceId(contact, email);
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error).toHaveProperty('context');
        expect((error as { context: { contactId: number; email: string } }).context).toEqual({
          contactId: testData.contactId,
          email,
        });
      }
    });
  });
});
