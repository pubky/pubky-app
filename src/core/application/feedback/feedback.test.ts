import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as Core from '@/core';
import * as Libs from '@/libs';
import { CHATWOOT_INBOX_IDS, CHATWOOT_FEEDBACK_MESSAGE_PREFIX } from '@/core/services/chatwoot';
import type { TFeedbackSubmitInput } from './feedback.types';
import type { TChatwootContact } from '@/core/services/chatwoot/chatwoot.types';

const testData = {
  userPubky: 'o1gg96ewuojmopcjbz8895478wdtxtzzuxnfjjz8o8e77csa1ngo' as Core.Pubky,
  userName: 'Test User',
  contactId: 456,
  sourceId: 'source-123',
};

const createFeedbackInput = (overrides: Partial<TFeedbackSubmitInput> = {}): TFeedbackSubmitInput => ({
  pubky: testData.userPubky,
  comment: 'This is a test feedback comment',
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

describe('FeedbackApplication', () => {
  let FeedbackApplication: typeof import('./feedback').FeedbackApplication;

  beforeEach(async () => {
    vi.clearAllMocks();

    // Mock ChatwootService methods
    vi.spyOn(Core.ChatwootService, 'createOrFindContact').mockResolvedValue(createMockContact());
    vi.spyOn(Core.ChatwootService, 'createConversation').mockResolvedValue(undefined);

    // Mock Logger
    vi.spyOn(Libs.Logger, 'error').mockImplementation(() => {});

    // Import FeedbackApplication
    const feedbackModule = await import('./feedback');
    FeedbackApplication = feedbackModule.FeedbackApplication;
  });

  describe('submit', () => {
    it('should build email correctly from pubky', async () => {
      const input = createFeedbackInput();
      const createOrFindContactSpy = vi.spyOn(Core.ChatwootService, 'createOrFindContact');

      await FeedbackApplication.submit(input);

      expect(createOrFindContactSpy).toHaveBeenCalledWith(
        `${testData.userPubky}@pubky.app`,
        expect.any(String),
        expect.any(Number),
      );
    });

    it('should use correct inbox ID for feedback', async () => {
      const input = createFeedbackInput();
      const createOrFindContactSpy = vi.spyOn(Core.ChatwootService, 'createOrFindContact');
      const createConversationSpy = vi.spyOn(Core.ChatwootService, 'createConversation');

      await FeedbackApplication.submit(input);

      // Verify inbox ID is passed to createOrFindContact
      expect(createOrFindContactSpy).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        CHATWOOT_INBOX_IDS.FEEDBACK,
      );

      // Verify inbox ID is passed to createConversation
      expect(createConversationSpy).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Number),
        CHATWOOT_INBOX_IDS.FEEDBACK,
        expect.any(String),
      );
    });

    it('should format message with Feedback prefix', async () => {
      const input = createFeedbackInput({ comment: 'My feedback' });
      const createConversationSpy = vi.spyOn(Core.ChatwootService, 'createConversation');

      await FeedbackApplication.submit(input);

      expect(createConversationSpy).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Number),
        expect.any(Number),
        expect.stringContaining(CHATWOOT_FEEDBACK_MESSAGE_PREFIX),
      );
      expect(createConversationSpy).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Number),
        expect.any(Number),
        expect.stringContaining('My feedback'),
      );
    });

    it('should call createOrFindContact with correct parameters', async () => {
      const input = createFeedbackInput();
      const createOrFindContactSpy = vi.spyOn(Core.ChatwootService, 'createOrFindContact');

      await FeedbackApplication.submit(input);

      expect(createOrFindContactSpy).toHaveBeenCalledWith(
        `${testData.userPubky}@pubky.app`,
        testData.userName,
        CHATWOOT_INBOX_IDS.FEEDBACK,
      );
    });

    it('should call createConversation with contact data and formatted message', async () => {
      const input = createFeedbackInput();
      const createConversationSpy = vi.spyOn(Core.ChatwootService, 'createConversation');

      await FeedbackApplication.submit(input);

      expect(createConversationSpy).toHaveBeenCalledWith(
        testData.sourceId,
        testData.contactId,
        CHATWOOT_INBOX_IDS.FEEDBACK,
        expect.any(String),
      );
    });

    it('should format message content correctly', async () => {
      const input = createFeedbackInput({ comment: 'Custom feedback message' });
      const createConversationSpy = vi.spyOn(Core.ChatwootService, 'createConversation');

      await FeedbackApplication.submit(input);

      // Verify the message format: "Feedback\n\n{comment}"
      expect(createConversationSpy).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Number),
        expect.any(Number),
        `${CHATWOOT_FEEDBACK_MESSAGE_PREFIX}\n\nCustom feedback message`,
      );
    });

    it('should throw AppError when contact has empty inbox associations', async () => {
      const input = createFeedbackInput();
      const contactWithoutInbox = createMockContact({ contact_inboxes: [] });
      vi.spyOn(Core.ChatwootService, 'createOrFindContact').mockResolvedValue(contactWithoutInbox);

      await expect(FeedbackApplication.submit(input)).rejects.toThrow('Contact has no inbox associations');

      expect(Libs.Logger.error).toHaveBeenCalledWith('Feedback submission failed', expect.any(Object));
    });

    it('should throw AppError when contact has undefined inbox associations', async () => {
      const input = createFeedbackInput();
      const contactWithUndefinedInbox = {
        id: testData.contactId,
        email: `${testData.userPubky}@pubky.app`,
        name: testData.userName,
        contact_inboxes: undefined,
      } as unknown as TChatwootContact;
      vi.spyOn(Core.ChatwootService, 'createOrFindContact').mockResolvedValue(contactWithUndefinedInbox);

      await expect(FeedbackApplication.submit(input)).rejects.toThrow('Contact has no inbox associations');

      expect(Libs.Logger.error).toHaveBeenCalledWith('Feedback submission failed', expect.any(Object));
    });

    it('should re-throw AppError from ChatwootService', async () => {
      const input = createFeedbackInput();
      const appError = Libs.Err.network(Libs.NetworkErrorCode.CONNECTION_FAILED, 'Chatwoot API error', {
        service: Libs.ErrorService.Chatwoot,
        operation: 'createOrFindContact',
        context: { statusCode: Libs.HttpStatusCode.INTERNAL_SERVER_ERROR },
      });
      vi.spyOn(Core.ChatwootService, 'createOrFindContact').mockRejectedValue(appError);

      await expect(FeedbackApplication.submit(input)).rejects.toThrow(appError);

      expect(Libs.Logger.error).toHaveBeenCalledWith('Feedback submission failed', {
        category: appError.category,
        code: appError.code,
        service: appError.service,
        operation: appError.operation,
        context: appError.context,
      });
    });

    it('should wrap unexpected errors in AppError', async () => {
      const input = createFeedbackInput();
      const unexpectedError = new Error('Unexpected error');
      vi.spyOn(Core.ChatwootService, 'createOrFindContact').mockRejectedValue(unexpectedError);

      await expect(FeedbackApplication.submit(input)).rejects.toThrow('Failed to submit feedback');

      expect(Libs.Logger.error).toHaveBeenCalledWith('Unexpected error during feedback submission', {
        error: unexpectedError,
      });
    });

    it('should throw AppError when createConversation fails', async () => {
      const input = createFeedbackInput();
      const appError = Libs.Err.network(Libs.NetworkErrorCode.CONNECTION_FAILED, 'Failed to create conversation', {
        service: Libs.ErrorService.Chatwoot,
        operation: 'createConversation',
        context: { statusCode: Libs.HttpStatusCode.INTERNAL_SERVER_ERROR },
      });
      vi.spyOn(Core.ChatwootService, 'createConversation').mockRejectedValue(appError);

      await expect(FeedbackApplication.submit(input)).rejects.toThrow(appError);

      expect(Libs.Logger.error).toHaveBeenCalledWith('Feedback submission failed', expect.any(Object));
    });
  });
});
