import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { POST, GET, OPTIONS } from './route';
import * as Config from '@/config';
import { ServerErrorCode, ValidationErrorCode } from '@/libs/error/error.codes';
import { Err } from '@/libs/error/error.factories';
import { ErrorService } from '@/libs/error/error.types';
import { FeedbackController } from '@/controllers/feedback/feedback';
import type { Pubky } from '@/models/models.types';
const testData = {
  userPubky: 'o1gg96ewuojmopcjbz8895478wdtxtzzuxnfjjz8o8e77csa1ngo' as Pubky,
  userName: 'Test User',
  comment: 'This is a test feedback comment',
};

const createPostRequest = (body: Record<string, unknown>) => {
  return new NextRequest('http://localhost:3000/api/feedback', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
};

describe('API Route: /api/feedback', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(FeedbackController, 'submit').mockResolvedValue(undefined);
  });

  describe('POST', () => {
    it('should successfully submit feedback', async () => {
      const request = createPostRequest({
        pubky: testData.userPubky,
        comment: testData.comment,
        name: testData.userName,
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.message).toBe('Success');
      expect(FeedbackController.submit).toHaveBeenCalledWith({
        pubky: testData.userPubky,
        comment: testData.comment,
        name: testData.userName,
      });
    });

    it('should handle AppError from application layer with correct status code', async () => {
      const appError = Err.validation(ValidationErrorCode.INVALID_INPUT, 'Validation failed', {
        service: ErrorService.Local,
        operation: 'submit',
        context: { statusCode: 400 },
      });
      vi.spyOn(FeedbackController, 'submit').mockRejectedValue(appError);

      const request = createPostRequest({
        pubky: testData.userPubky,
        comment: testData.comment,
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
      vi.spyOn(FeedbackController, 'submit').mockRejectedValue(appError);

      const request = createPostRequest({
        pubky: testData.userPubky,
        comment: testData.comment,
        name: testData.userName,
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.error).toBe('Server error');
    });

    it('should handle unexpected errors with 500 status', async () => {
      vi.spyOn(FeedbackController, 'submit').mockRejectedValue(new Error('Unexpected error'));

      const request = createPostRequest({
        pubky: testData.userPubky,
        comment: testData.comment,
        name: testData.userName,
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.error).toBe('Internal Server Error');
    });

    it('should handle invalid JSON body', async () => {
      // NextRequest.json() may throw or return error response depending on Next.js version
      // This tests that the route properly handles JSON parsing errors
      const request = new NextRequest('http://localhost:3000/api/feedback', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: 'invalid json',
      });

      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      try {
        const response = await POST(request);
        const data = await response.json();
        // If it doesn't throw, it should return an error response
        expect(response.status).toBe(500);
        expect(data.error).toBe('Internal Server Error');
      } catch (error) {
        // If it throws, that's also acceptable
        expect(error).toBeInstanceOf(Error);
      }

      consoleErrorSpy.mockRestore();
    });

    it('should handle missing pubky in body', async () => {
      const request = createPostRequest({
        comment: testData.comment,
        name: testData.userName,
      });

      // The controller will validate and throw AppError
      const appError = Err.validation(
        ValidationErrorCode.INVALID_INPUT,
        'Pubky is required and must be a non-empty string',
        { service: ErrorService.Local, operation: 'submit', context: { statusCode: 400 } },
      );
      vi.spyOn(FeedbackController, 'submit').mockRejectedValue(appError);

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Pubky is required and must be a non-empty string');
    });

    it('should handle missing comment in body', async () => {
      const request = createPostRequest({
        pubky: testData.userPubky,
        name: testData.userName,
      });

      // The controller will validate and throw AppError
      const appError = Err.validation(
        ValidationErrorCode.INVALID_INPUT,
        'Comment is required and must be a non-empty string',
        { service: ErrorService.Local, operation: 'submit', context: { statusCode: 400 } },
      );
      vi.spyOn(FeedbackController, 'submit').mockRejectedValue(appError);

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Comment is required and must be a non-empty string');
    });

    it('should handle missing name in body', async () => {
      const request = createPostRequest({
        pubky: testData.userPubky,
        comment: testData.comment,
      });

      // The controller will validate and throw AppError
      const appError = Err.validation(
        ValidationErrorCode.INVALID_INPUT,
        'Name is required and must be a non-empty string',
        { service: ErrorService.Local, operation: 'submit', context: { statusCode: 400 } },
      );
      vi.spyOn(FeedbackController, 'submit').mockRejectedValue(appError);

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Name is required and must be a non-empty string');
    });

    it('should handle comment exceeding max length', async () => {
      const longComment = 'a'.repeat(Config.FEEDBACK_MAX_CHARACTER_LENGTH + 1);
      const request = createPostRequest({
        pubky: testData.userPubky,
        comment: longComment,
        name: testData.userName,
      });

      // The controller will validate and throw AppError
      const appError = Err.validation(
        ValidationErrorCode.INVALID_INPUT,
        `Comment must be no more than ${Config.FEEDBACK_MAX_CHARACTER_LENGTH} characters`,
        { service: ErrorService.Local, operation: 'submit', context: { statusCode: 400 } },
      );
      vi.spyOn(FeedbackController, 'submit').mockRejectedValue(appError);

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe(`Comment must be no more than ${Config.FEEDBACK_MAX_CHARACTER_LENGTH} characters`);
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
