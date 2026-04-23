import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as Core from '@/core';
import { REPORT_ISSUE_TYPES, REPORT_REASON_MAX_LENGTH, REPORT_ISSUE_TYPE_VALUES } from '@/core/pipes/report';
import type { TReportSubmitParams } from './report.types';
import { asInvalid } from '@/test-utils';

const testData = {
  userPubky: 'o1gg96ewuojmopcjbz8895478wdtxtzzuxnfjjz8o8e77csa1ngo' as Core.Pubky,
  userName: 'Test User',
  postUrl: 'https://example.com/post/abc123',
};

const createReportParams = (overrides: Partial<TReportSubmitParams> = {}): TReportSubmitParams => ({
  pubky: testData.userPubky,
  postUrl: testData.postUrl,
  issueType: REPORT_ISSUE_TYPES.PERSONAL_INFO,
  reason: 'This post contains my personal information without consent',
  name: testData.userName,
  ...overrides,
});

describe('ReportController', () => {
  let ReportController: typeof import('./report').ReportController;

  beforeEach(async () => {
    vi.clearAllMocks();

    // Mock ReportApplication
    vi.spyOn(Core.ReportApplication, 'submit').mockResolvedValue(undefined);

    // Import ReportController
    const reportModule = await import('./report');
    ReportController = reportModule.ReportController;
  });

  describe('submit', () => {
    it('should pass validated params to application layer', async () => {
      const params = createReportParams();
      const submitSpy = vi.spyOn(Core.ReportApplication, 'submit');

      await ReportController.submit(params);

      expect(submitSpy).toHaveBeenCalledWith({
        pubky: testData.userPubky,
        postUrl: testData.postUrl,
        issueType: REPORT_ISSUE_TYPES.PERSONAL_INFO,
        reason: params.reason,
        name: testData.userName,
      });
    });

    it('should accept all valid issue types', async () => {
      const submitSpy = vi.spyOn(Core.ReportApplication, 'submit');

      for (const issueType of Object.values(REPORT_ISSUE_TYPES)) {
        submitSpy.mockClear();
        const params = createReportParams({ issueType });

        await ReportController.submit(params);

        expect(submitSpy).toHaveBeenCalledWith(expect.objectContaining({ issueType }));
      }
    });

    it('should throw when pubky is missing', async () => {
      const params = createReportParams({ pubky: '' as Core.Pubky });

      await expect(ReportController.submit(params)).rejects.toThrow('Pubky is required and must be a non-empty string');
    });

    it('should throw when pubky is null', async () => {
      const params = createReportParams({ pubky: asInvalid<Core.Pubky>(null) });

      await expect(ReportController.submit(params)).rejects.toThrow('Pubky is required and must be a non-empty string');
    });

    it('should throw when postUrl is missing', async () => {
      const params = createReportParams({ postUrl: '' });

      await expect(ReportController.submit(params)).rejects.toThrow(
        'Post URL is required and must be a non-empty string',
      );
    });

    it('should throw when postUrl is null', async () => {
      const params = createReportParams({ postUrl: asInvalid<string>(null) });

      await expect(ReportController.submit(params)).rejects.toThrow(
        'Post URL is required and must be a non-empty string',
      );
    });

    it('should throw when issueType is missing', async () => {
      const params = createReportParams({ issueType: '' });

      await expect(ReportController.submit(params)).rejects.toThrow(
        'Issue type is required and must be a non-empty string',
      );
    });

    it('should throw when issueType is null', async () => {
      const params = createReportParams({ issueType: asInvalid<string>(null) });

      await expect(ReportController.submit(params)).rejects.toThrow(
        'Issue type is required and must be a non-empty string',
      );
    });

    it('should throw when issueType is invalid', async () => {
      const params = createReportParams({ issueType: 'invalid-type' });

      await expect(ReportController.submit(params)).rejects.toThrow(
        `Invalid issue type. Must be one of: ${REPORT_ISSUE_TYPE_VALUES.join(', ')}`,
      );
    });

    it('should throw when reason is missing', async () => {
      const params = createReportParams({ reason: '' });

      await expect(ReportController.submit(params)).rejects.toThrow(
        'Reason is required and must be a non-empty string',
      );
    });

    it('should throw when reason is null', async () => {
      const params = createReportParams({ reason: asInvalid<string>(null) });

      await expect(ReportController.submit(params)).rejects.toThrow(
        'Reason is required and must be a non-empty string',
      );
    });

    it('should throw when reason exceeds max length', async () => {
      const longReason = 'a'.repeat(REPORT_REASON_MAX_LENGTH + 1);
      const params = createReportParams({ reason: longReason });

      await expect(ReportController.submit(params)).rejects.toThrow(
        `Reason must be no more than ${REPORT_REASON_MAX_LENGTH} characters`,
      );
    });

    it('should accept reason at max length', async () => {
      const maxLengthReason = 'a'.repeat(REPORT_REASON_MAX_LENGTH);
      const params = createReportParams({ reason: maxLengthReason });
      const submitSpy = vi.spyOn(Core.ReportApplication, 'submit');

      await ReportController.submit(params);

      expect(submitSpy).toHaveBeenCalledWith(expect.objectContaining({ reason: maxLengthReason }));
    });

    it('should throw when name is missing', async () => {
      const params = createReportParams({ name: '' });

      await expect(ReportController.submit(params)).rejects.toThrow('Name is required and must be a non-empty string');
    });

    it('should throw when name is null', async () => {
      const params = createReportParams({ name: asInvalid<string>(null) });

      await expect(ReportController.submit(params)).rejects.toThrow('Name is required and must be a non-empty string');
    });

    it('should throw when application layer fails', async () => {
      vi.spyOn(Core.ReportApplication, 'submit').mockRejectedValue(new Error('Application error'));

      const params = createReportParams();

      await expect(ReportController.submit(params)).rejects.toThrow('Application error');
    });

    it('should trim whitespace from inputs', async () => {
      const params = createReportParams({
        pubky: '  test-pubky  ' as Core.Pubky,
        postUrl: '  https://example.com/post  ',
        issueType: `  ${REPORT_ISSUE_TYPES.HATE_SPEECH}  `,
        reason: '  Some reason  ',
        name: '  Test User  ',
      });
      const submitSpy = vi.spyOn(Core.ReportApplication, 'submit');

      await ReportController.submit(params);

      expect(submitSpy).toHaveBeenCalledWith({
        pubky: 'test-pubky',
        postUrl: 'https://example.com/post',
        issueType: REPORT_ISSUE_TYPES.HATE_SPEECH,
        reason: 'Some reason',
        name: 'Test User',
      });
    });
  });
});
