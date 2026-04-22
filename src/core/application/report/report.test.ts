import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as Core from '@/core';
import * as Libs from '@/libs';
import { REPORT_ISSUE_TYPES, REPORT_ISSUE_LABELS } from '@/core/pipes/report';
import { CHATWOOT_INBOX_IDS, CHATWOOT_REPORT_MESSAGE_PREFIX } from '@/core/services/chatwoot';
import type { TReportSubmitInput } from './report.types';
import type { TChatwootContact } from '@/core/services/chatwoot/chatwoot.types';

const testData = {
  userPubky: 'o1gg96ewuojmopcjbz8895478wdtxtzzuxnfjjz8o8e77csa1ngo' as Core.Pubky,
  userName: 'Test User',
  postUrl: 'https://example.com/post/abc123',
  contactId: 456,
  sourceId: 'source-123',
};

const createReportInput = (overrides: Partial<TReportSubmitInput> = {}): TReportSubmitInput => ({
  pubky: testData.userPubky,
  postUrl: testData.postUrl,
  issueType: REPORT_ISSUE_TYPES.PERSONAL_INFO,
  reason: 'This post contains my personal information without consent',
  name: testData.userName,
  ...overrides,
});

const createMockContact = (overrides: Partial<TChatwootContact> = {}): TChatwootContact => ({
  id: testData.contactId,
  email: `${testData.userPubky}@pubky.app`,
  name: testData.userName,
  contact_inboxes: [
    {
      source_id: testData.sourceId,
    },
  ],
  ...overrides,
});

describe('ReportApplication', () => {
  let ReportApplication: typeof import('./report').ReportApplication;

  beforeEach(async () => {
    vi.clearAllMocks();

    // Mock ChatwootService methods
    vi.spyOn(Core.ChatwootService, 'createOrFindContact').mockResolvedValue(createMockContact());
    vi.spyOn(Core.ChatwootService, 'createConversation').mockResolvedValue(undefined);

    // Mock Logger
    vi.spyOn(Libs.Logger, 'error').mockImplementation(() => {});

    // Import ReportApplication
    const reportModule = await import('./report');
    ReportApplication = reportModule.ReportApplication;
  });

  describe('submit', () => {
    it('should build email correctly from pubky', async () => {
      const input = createReportInput();
      const createOrFindContactSpy = vi.spyOn(Core.ChatwootService, 'createOrFindContact');

      await ReportApplication.submit(input);

      expect(createOrFindContactSpy).toHaveBeenCalledWith(
        `${testData.userPubky}@pubky.app`,
        expect.any(String),
        expect.any(Number),
      );
    });

    it('should use correct inbox ID for reports', async () => {
      const input = createReportInput();
      const createOrFindContactSpy = vi.spyOn(Core.ChatwootService, 'createOrFindContact');
      const createConversationSpy = vi.spyOn(Core.ChatwootService, 'createConversation');

      await ReportApplication.submit(input);

      // Verify inbox ID is passed to createOrFindContact
      expect(createOrFindContactSpy).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        CHATWOOT_INBOX_IDS.REPORTS,
      );

      // Verify inbox ID is passed to createConversation
      expect(createConversationSpy).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Number),
        CHATWOOT_INBOX_IDS.REPORTS,
        expect.any(String),
      );
    });

    it('should format message with source label prefix', async () => {
      const input = createReportInput();
      const createConversationSpy = vi.spyOn(Core.ChatwootService, 'createConversation');

      await ReportApplication.submit(input);

      const expectedSourceLabel = `${CHATWOOT_REPORT_MESSAGE_PREFIX} - ${REPORT_ISSUE_LABELS[REPORT_ISSUE_TYPES.PERSONAL_INFO]}`;
      expect(createConversationSpy).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Number),
        expect.any(Number),
        expect.stringContaining(expectedSourceLabel),
      );
    });

    it('should include post URL and reason in message content', async () => {
      const input = createReportInput();
      const createConversationSpy = vi.spyOn(Core.ChatwootService, 'createConversation');

      await ReportApplication.submit(input);

      expect(createConversationSpy).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Number),
        expect.any(Number),
        expect.stringContaining(`Post URL: ${testData.postUrl}`),
      );
      expect(createConversationSpy).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Number),
        expect.any(Number),
        expect.stringContaining(`Reason: ${input.reason}`),
      );
    });

    it('should format source label correctly for each issue type', async () => {
      const createConversationSpy = vi.spyOn(Core.ChatwootService, 'createConversation');

      for (const issueType of Object.values(REPORT_ISSUE_TYPES)) {
        createConversationSpy.mockClear();
        vi.spyOn(Core.ChatwootService, 'createOrFindContact').mockResolvedValue(createMockContact());

        const input = createReportInput({ issueType });
        await ReportApplication.submit(input);

        const expectedSourceLabel = `${CHATWOOT_REPORT_MESSAGE_PREFIX} - ${REPORT_ISSUE_LABELS[issueType]}`;
        expect(createConversationSpy).toHaveBeenCalledWith(
          expect.any(String),
          expect.any(Number),
          expect.any(Number),
          expect.stringContaining(expectedSourceLabel),
        );
      }
    });

    it('should call createOrFindContact with correct parameters', async () => {
      const input = createReportInput();
      const createOrFindContactSpy = vi.spyOn(Core.ChatwootService, 'createOrFindContact');

      await ReportApplication.submit(input);

      expect(createOrFindContactSpy).toHaveBeenCalledWith(
        `${testData.userPubky}@pubky.app`,
        testData.userName,
        CHATWOOT_INBOX_IDS.REPORTS,
      );
    });

    it('should call createConversation with contact data and formatted message', async () => {
      const input = createReportInput();
      const createConversationSpy = vi.spyOn(Core.ChatwootService, 'createConversation');

      await ReportApplication.submit(input);

      expect(createConversationSpy).toHaveBeenCalledWith(
        testData.sourceId,
        testData.contactId,
        CHATWOOT_INBOX_IDS.REPORTS,
        expect.any(String),
      );
    });

    it('should throw AppError when contact has empty inbox associations', async () => {
      const input = createReportInput();
      const contactWithoutInbox = createMockContact({ contact_inboxes: [] });
      vi.spyOn(Core.ChatwootService, 'createOrFindContact').mockResolvedValue(contactWithoutInbox);

      await expect(ReportApplication.submit(input)).rejects.toThrow('Contact has no inbox associations');

      expect(Libs.Logger.error).toHaveBeenCalledWith('Report submission failed', expect.any(Object));
    });

    it('should throw AppError when contact has undefined inbox associations', async () => {
      const input = createReportInput();
      const contactWithUndefinedInbox = {
        id: testData.contactId,
        email: `${testData.userPubky}@pubky.app`,
        name: testData.userName,
        contact_inboxes: undefined,
      } as unknown as TChatwootContact;
      vi.spyOn(Core.ChatwootService, 'createOrFindContact').mockResolvedValue(contactWithUndefinedInbox);

      await expect(ReportApplication.submit(input)).rejects.toThrow('Contact has no inbox associations');

      expect(Libs.Logger.error).toHaveBeenCalledWith('Report submission failed', expect.any(Object));
    });

    it('should re-throw AppError from ChatwootService', async () => {
      const input = createReportInput();
      const appError = Libs.Err.network(Libs.NetworkErrorCode.CONNECTION_FAILED, 'Chatwoot API error', {
        service: Libs.ErrorService.Chatwoot,
        operation: 'createOrFindContact',
        context: { statusCode: Libs.HttpStatusCode.INTERNAL_SERVER_ERROR },
      });
      vi.spyOn(Core.ChatwootService, 'createOrFindContact').mockRejectedValue(appError);

      await expect(ReportApplication.submit(input)).rejects.toThrow(appError);

      expect(Libs.Logger.error).toHaveBeenCalledWith('Report submission failed', {
        category: appError.category,
        code: appError.code,
        service: appError.service,
        operation: appError.operation,
        context: appError.context,
      });
    });

    it('should wrap unexpected errors in AppError', async () => {
      const input = createReportInput();
      const unexpectedError = new Error('Unexpected error');
      vi.spyOn(Core.ChatwootService, 'createOrFindContact').mockRejectedValue(unexpectedError);

      await expect(ReportApplication.submit(input)).rejects.toThrow('Failed to submit report');

      expect(Libs.Logger.error).toHaveBeenCalledWith('Unexpected error during report submission', {
        error: unexpectedError,
      });
    });

    it('should throw AppError when createConversation fails', async () => {
      const input = createReportInput();
      const appError = Libs.Err.network(Libs.NetworkErrorCode.CONNECTION_FAILED, 'Failed to create conversation', {
        service: Libs.ErrorService.Chatwoot,
        operation: 'createConversation',
        context: { statusCode: Libs.HttpStatusCode.INTERNAL_SERVER_ERROR },
      });
      vi.spyOn(Core.ChatwootService, 'createConversation').mockRejectedValue(appError);

      await expect(ReportApplication.submit(input)).rejects.toThrow(appError);

      expect(Libs.Logger.error).toHaveBeenCalledWith('Report submission failed', expect.any(Object));
    });
  });
});
