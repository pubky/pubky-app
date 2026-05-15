import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FeedbackApplication } from '@/application/feedback/feedback';
import { FEEDBACK_MAX_CHARACTER_LENGTH } from '@/config/posts';
import type { Pubky } from '@/models/models.types';
import { asInvalid } from '@/test-utils/type-assertions';
import type { TFeedbackSubmitParams } from './feedback.types';

const testData = {
  userPubky: 'o1gg96ewuojmopcjbz8895478wdtxtzzuxnfjjz8o8e77csa1ngo' as Pubky,
  userName: 'Test User',
};

const createFeedbackParams = (overrides: Partial<TFeedbackSubmitParams> = {}): TFeedbackSubmitParams => ({
  pubky: testData.userPubky,
  comment: 'This is a test feedback comment',
  name: testData.userName,
  ...overrides,
});

describe('FeedbackController', () => {
  let FeedbackController: typeof import('./feedback').FeedbackController;

  beforeEach(async () => {
    vi.clearAllMocks();

    // Mock FeedbackApplication
    vi.spyOn(FeedbackApplication, 'submit').mockResolvedValue(undefined);

    // Import FeedbackController
    const feedbackModule = await import('./feedback');
    FeedbackController = feedbackModule.FeedbackController;
  });

  describe('submit', () => {
    it('should pass params to application layer', async () => {
      const params = createFeedbackParams();
      const submitSpy = vi.spyOn(FeedbackApplication, 'submit');

      await FeedbackController.submit(params);

      expect(submitSpy).toHaveBeenCalledWith({
        pubky: testData.userPubky,
        comment: params.comment,
        name: testData.userName,
      });
    });

    it('should throw when pubky is missing', async () => {
      const params = createFeedbackParams({ pubky: '' as Pubky });

      await expect(FeedbackController.submit(params)).rejects.toThrow(
        'Pubky is required and must be a non-empty string',
      );
    });

    it('should throw when pubky is null', async () => {
      const params = createFeedbackParams({ pubky: asInvalid<Pubky>(null) });

      await expect(FeedbackController.submit(params)).rejects.toThrow(
        'Pubky is required and must be a non-empty string',
      );
    });

    it('should throw when comment is missing', async () => {
      const params = createFeedbackParams({ comment: '' });

      await expect(FeedbackController.submit(params)).rejects.toThrow(
        'Comment is required and must be a non-empty string',
      );
    });

    it('should throw when comment is null', async () => {
      const params = createFeedbackParams({ comment: asInvalid<string>(null) });

      await expect(FeedbackController.submit(params)).rejects.toThrow(
        'Comment is required and must be a non-empty string',
      );
    });

    it('should throw when name is missing', async () => {
      const params = createFeedbackParams({ name: '' });

      await expect(FeedbackController.submit(params)).rejects.toThrow(
        'Name is required and must be a non-empty string',
      );
    });

    it('should throw when name is null', async () => {
      const params = createFeedbackParams({ name: asInvalid<string>(null) });

      await expect(FeedbackController.submit(params)).rejects.toThrow(
        'Name is required and must be a non-empty string',
      );
    });

    it('should throw when application layer fails', async () => {
      vi.spyOn(FeedbackApplication, 'submit').mockRejectedValue(new Error('Application error'));

      const params = createFeedbackParams();

      await expect(FeedbackController.submit(params)).rejects.toThrow('Application error');
    });

    it('should accept comment at max length', async () => {
      const maxLengthComment = 'a'.repeat(FEEDBACK_MAX_CHARACTER_LENGTH);
      const params = createFeedbackParams({ comment: maxLengthComment });
      const submitSpy = vi.spyOn(FeedbackApplication, 'submit');

      await FeedbackController.submit(params);

      expect(submitSpy).toHaveBeenCalledWith({
        pubky: testData.userPubky,
        comment: maxLengthComment,
        name: testData.userName,
      });
    });

    it('should throw when comment exceeds max length', async () => {
      const longComment = 'a'.repeat(FEEDBACK_MAX_CHARACTER_LENGTH + 1);
      const params = createFeedbackParams({ comment: longComment });

      await expect(FeedbackController.submit(params)).rejects.toThrow(
        `Comment must be no more than ${FEEDBACK_MAX_CHARACTER_LENGTH} characters`,
      );
    });
  });
});
