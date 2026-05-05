import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ReportController } from '@/controllers/report/report';
import { ServerErrorCode, ValidationErrorCode } from '@/libs/error/error.codes';
import { Err } from '@/libs/error/error.factories';
import { ErrorService } from '@/libs/error/error.types';
import type { Pubky } from '@/models/models.types';
import { REPORT_REASON_MAX_LENGTH } from '@/pipes/report/report.constants';
import { GET, OPTIONS, POST } from './route';

const testData = {
  userPubky: 'o1gg96ewuojmopcjbz8895478wdtxtzzuxnfjjz8o8e77csa1ngo' as Pubky,
  userName: 'Test User',
  postUrl: 'https://example.com/post/123',
  issueType: 'hate-speech',
  reason: 'This is a test report reason',
};

const createPostRequest = (body: Record<string, unknown>) => {
  return new NextRequest('http://localhost:3000/api/report', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
};

describe('API Route: /api/report', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(ReportController, 'submit').mockResolvedValue(undefined);
  });

  describe('POST', () => {
    it('should successfully submit report', async () => {
      const request = createPostRequest({
        pubky: testData.userPubky,
        postUrl: testData.postUrl,
        issueType: testData.issueType,
        reason: testData.reason,
        name: testData.userName,
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.message).toBe('Success');
      expect(ReportController.submit).toHaveBeenCalledWith({
        pubky: testData.userPubky,
        postUrl: testData.postUrl,
        issueType: testData.issueType,
        reason: testData.reason,
        name: testData.userName,
      });
    });

    it('should handle AppError from application layer with correct status code', async () => {
      const appError = Err.validation(ValidationErrorCode.INVALID_INPUT, 'Validation failed', {
        service: ErrorService.Local,
        operation: 'submit',
        context: { statusCode: 400 },
      });
      vi.spyOn(ReportController, 'submit').mockRejectedValue(appError);

      const request = createPostRequest({
        pubky: testData.userPubky,
        postUrl: testData.postUrl,
        issueType: testData.issueType,
        reason: testData.reason,
        name: testData.userName,
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Validation failed');
    });

    it('should handle AppError with different status codes', async () => {
      const appError = Err.server(ServerErrorCode.INTERNAL_ERROR, 'Server error', {
        service: ErrorService.Local,
        operation: 'submit',
        context: { statusCode: 500 },
      });
      vi.spyOn(ReportController, 'submit').mockRejectedValue(appError);

      const request = createPostRequest({
        pubky: testData.userPubky,
        postUrl: testData.postUrl,
        issueType: testData.issueType,
        reason: testData.reason,
        name: testData.userName,
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.error).toBe('Server error');
    });

    it('should handle unexpected errors with 500 status', async () => {
      vi.spyOn(ReportController, 'submit').mockRejectedValue(new Error('Unexpected error'));

      const request = createPostRequest({
        pubky: testData.userPubky,
        postUrl: testData.postUrl,
        issueType: testData.issueType,
        reason: testData.reason,
        name: testData.userName,
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.error).toBe('Internal Server Error');
    });

    it('should handle invalid JSON body', async () => {
      const request = new NextRequest('http://localhost:3000/api/report', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: 'invalid json',
      });

      try {
        const response = await POST(request);
        const data = await response.json();
        expect(response.status).toBe(500);
        expect(data.error).toBe('Internal Server Error');
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
      }
    });

    it('should handle missing pubky in body', async () => {
      const request = createPostRequest({
        postUrl: testData.postUrl,
        issueType: testData.issueType,
        reason: testData.reason,
        name: testData.userName,
      });

      const appError = Err.validation(
        ValidationErrorCode.INVALID_INPUT,
        'Pubky is required and must be a non-empty string',
        { service: ErrorService.Local, operation: 'submit', context: { statusCode: 400 } },
      );
      vi.spyOn(ReportController, 'submit').mockRejectedValue(appError);

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Pubky is required and must be a non-empty string');
    });

    it('should handle missing postUrl in body', async () => {
      const request = createPostRequest({
        pubky: testData.userPubky,
        issueType: testData.issueType,
        reason: testData.reason,
        name: testData.userName,
      });

      const appError = Err.validation(
        ValidationErrorCode.INVALID_INPUT,
        'Post URL is required and must be a non-empty string',
        { service: ErrorService.Local, operation: 'submit', context: { statusCode: 400 } },
      );
      vi.spyOn(ReportController, 'submit').mockRejectedValue(appError);

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Post URL is required and must be a non-empty string');
    });

    it('should handle missing issueType in body', async () => {
      const request = createPostRequest({
        pubky: testData.userPubky,
        postUrl: testData.postUrl,
        reason: testData.reason,
        name: testData.userName,
      });

      const appError = Err.validation(
        ValidationErrorCode.INVALID_INPUT,
        'Issue type is required and must be a non-empty string',
        { service: ErrorService.Local, operation: 'submit', context: { statusCode: 400 } },
      );
      vi.spyOn(ReportController, 'submit').mockRejectedValue(appError);

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Issue type is required and must be a non-empty string');
    });

    it('should handle invalid issueType in body', async () => {
      const request = createPostRequest({
        pubky: testData.userPubky,
        postUrl: testData.postUrl,
        issueType: 'invalid-type',
        reason: testData.reason,
        name: testData.userName,
      });

      const appError = Err.validation(ValidationErrorCode.INVALID_INPUT, 'Invalid issue type: invalid-type', {
        service: ErrorService.Local,
        operation: 'submit',
        context: { statusCode: 400 },
      });
      vi.spyOn(ReportController, 'submit').mockRejectedValue(appError);

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Invalid issue type: invalid-type');
    });

    it('should handle missing reason in body', async () => {
      const request = createPostRequest({
        pubky: testData.userPubky,
        postUrl: testData.postUrl,
        issueType: testData.issueType,
        name: testData.userName,
      });

      const appError = Err.validation(
        ValidationErrorCode.INVALID_INPUT,
        'Reason is required and must be a non-empty string',
        { service: ErrorService.Local, operation: 'submit', context: { statusCode: 400 } },
      );
      vi.spyOn(ReportController, 'submit').mockRejectedValue(appError);

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Reason is required and must be a non-empty string');
    });

    it('should handle missing name in body', async () => {
      const request = createPostRequest({
        pubky: testData.userPubky,
        postUrl: testData.postUrl,
        issueType: testData.issueType,
        reason: testData.reason,
      });

      const appError = Err.validation(
        ValidationErrorCode.INVALID_INPUT,
        'Name is required and must be a non-empty string',
        { service: ErrorService.Local, operation: 'submit', context: { statusCode: 400 } },
      );
      vi.spyOn(ReportController, 'submit').mockRejectedValue(appError);

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Name is required and must be a non-empty string');
    });

    it('should handle reason exceeding max length', async () => {
      const longReason = 'a'.repeat(REPORT_REASON_MAX_LENGTH + 1);
      const request = createPostRequest({
        pubky: testData.userPubky,
        postUrl: testData.postUrl,
        issueType: testData.issueType,
        reason: longReason,
        name: testData.userName,
      });

      const appError = Err.validation(
        ValidationErrorCode.INVALID_INPUT,
        `Reason must be no more than ${REPORT_REASON_MAX_LENGTH} characters`,
        { service: ErrorService.Local, operation: 'submit', context: { statusCode: 400 } },
      );
      vi.spyOn(ReportController, 'submit').mockRejectedValue(appError);

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe(`Reason must be no more than ${REPORT_REASON_MAX_LENGTH} characters`);
    });
  });

  describe('GET', () => {
    it('should return 405 Method Not Allowed', async () => {
      const response = await GET();
      const data = await response.json();

      expect(response.status).toBe(405);
      expect(data.error).toBe('Method not allowed. Use POST instead.');
    });
  });

  describe('OPTIONS', () => {
    it('should return CORS headers', async () => {
      const response = await OPTIONS();

      expect(response.status).toBe(200);
      expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
      expect(response.headers.get('Access-Control-Allow-Methods')).toBe('POST, OPTIONS');
      expect(response.headers.get('Access-Control-Allow-Headers')).toBe('Content-Type');
    });
  });
});
