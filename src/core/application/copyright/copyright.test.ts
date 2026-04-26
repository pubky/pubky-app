import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as Core from '@/core';
import { CHATWOOT_INBOX_IDS } from '@/core/services/chatwoot';
import type { TCopyrightSubmitInput } from './copyright.types';
import type { TChatwootContact } from '@/core/services/chatwoot/chatwoot.types';
import { ServerErrorCode } from '@/libs/error/error.codes';
import { Err } from '@/libs/error/error.factories';
import { ErrorService } from '@/libs/error/error.types';

const testData = {
  nameOwner: 'John Doe',
  originalContentUrls: 'https://example.com/original',
  briefDescription: 'Original artwork',
  infringingContentUrl: 'https://example.com/infringing',
  firstName: 'John',
  lastName: 'Doe',
  email: 'john@example.com',
  phoneNumber: '123-456-7890',
  streetAddress: '123 Main St',
  country: 'United States',
  city: 'New York',
  stateProvince: 'NY',
  zipCode: '10001',
  signature: 'John Doe',
  isRightsOwner: true,
  isReportingOnBehalf: false,
  contactId: 456,
  sourceId: 'source-123',
};

const createCopyrightInput = (overrides: Partial<TCopyrightSubmitInput> = {}): TCopyrightSubmitInput => ({
  ...testData,
  ...overrides,
});

const createMockContact = (overrides: Partial<TChatwootContact> = {}): TChatwootContact => ({
  id: testData.contactId,
  email: testData.email,
  name: `${testData.firstName} ${testData.lastName}`,
  contact_inboxes: [{ source_id: testData.sourceId }],
  ...overrides,
});

describe('CopyrightApplication', () => {
  let CopyrightApplication: typeof import('./copyright').CopyrightApplication;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.spyOn(Core.ChatwootService, 'createOrFindContact').mockResolvedValue(createMockContact());
    vi.spyOn(Core.ChatwootService, 'createConversation').mockResolvedValue(undefined);

    const copyrightModule = await import('./copyright');
    CopyrightApplication = copyrightModule.CopyrightApplication;
  });

  describe('submit', () => {
    it('should call createOrFindContact with email, name, and inbox ID', async () => {
      const input = createCopyrightInput();
      const spy = vi.spyOn(Core.ChatwootService, 'createOrFindContact');

      await CopyrightApplication.submit(input);

      expect(spy).toHaveBeenCalledWith(
        testData.email,
        `${testData.firstName} ${testData.lastName}`,
        CHATWOOT_INBOX_IDS.COPYRIGHT,
      );
    });

    it('should call createConversation with contact data and formatted message', async () => {
      const input = createCopyrightInput();
      const spy = vi.spyOn(Core.ChatwootService, 'createConversation');

      await CopyrightApplication.submit(input);

      expect(spy).toHaveBeenCalledWith(
        testData.sourceId,
        testData.contactId,
        CHATWOOT_INBOX_IDS.COPYRIGHT,
        expect.stringContaining('Copyright Removal Request'),
      );
    });

    it('should include form data as JSON in message content', async () => {
      const input = createCopyrightInput();
      const spy = vi.spyOn(Core.ChatwootService, 'createConversation');

      await CopyrightApplication.submit(input);

      const content = spy.mock.calls[0][3] as string;
      expect(content).toContain('"nameOwner"');
      expect(content).toContain(testData.nameOwner);
      expect(content).toContain(testData.email);
    });

    it('should throw when contact has empty inbox associations', async () => {
      const input = createCopyrightInput();
      vi.spyOn(Core.ChatwootService, 'createOrFindContact').mockResolvedValue(
        createMockContact({ contact_inboxes: [] }),
      );

      await expect(CopyrightApplication.submit(input)).rejects.toThrow('Contact has no inbox associations');
    });

    it('should propagate errors from ChatwootService', async () => {
      const input = createCopyrightInput();
      const appError = Err.server(ServerErrorCode.SERVICE_UNAVAILABLE, 'Chatwoot API error', {
        service: ErrorService.Chatwoot,
        operation: 'createOrFindContact',
      });
      vi.spyOn(Core.ChatwootService, 'createOrFindContact').mockRejectedValue(appError);

      await expect(CopyrightApplication.submit(input)).rejects.toThrow(appError);
    });

    it('should propagate errors from createConversation', async () => {
      const input = createCopyrightInput();
      const appError = Err.server(ServerErrorCode.SERVICE_UNAVAILABLE, 'Failed to create conversation', {
        service: ErrorService.Chatwoot,
        operation: 'createConversation',
      });
      vi.spyOn(Core.ChatwootService, 'createConversation').mockRejectedValue(appError);

      await expect(CopyrightApplication.submit(input)).rejects.toThrow(appError);
    });
  });
});
