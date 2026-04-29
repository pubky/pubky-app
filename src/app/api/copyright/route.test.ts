import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { POST, GET, OPTIONS } from './route';
import { ServerErrorCode, ValidationErrorCode } from '@/libs/error/error.codes';
import { Err } from '@/libs/error/error.factories';
import { ErrorService } from '@/libs/error/error.types';
import { HttpStatusCode } from '@/libs/http/http.types';
import { Logger } from '@/libs/logger/logger';
import { CopyrightController } from '@/controllers/copyright/copyright';
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
};

const createPostRequest = (body: Record<string, unknown>) => {
  return new NextRequest('http://localhost:3000/api/copyright', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
};

describe('API Route: /api/copyright', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(CopyrightController, 'submit').mockResolvedValue(undefined);
    vi.spyOn(Logger, 'error').mockImplementation(() => {});
  });

  describe('POST', () => {
    it('should successfully submit copyright request', async () => {
      const request = createPostRequest(testData);

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.message).toBe('Success');
      expect(CopyrightController.submit).toHaveBeenCalledWith(testData);
    });

    it('should handle validation errors with 500 status (no statusCode in context)', async () => {
      const appError = Err.validation(ValidationErrorCode.MISSING_FIELD, 'Validation failed', {
        service: ErrorService.Local,
        operation: 'validateNameOwner',
      });
      vi.spyOn(CopyrightController, 'submit').mockRejectedValue(appError);

      const request = createPostRequest(testData);
      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(HttpStatusCode.INTERNAL_SERVER_ERROR);
      expect(data.error).toBe('Validation failed');
    });

    it('should handle AppError with statusCode in context', async () => {
      const appError = Err.server(ServerErrorCode.SERVICE_UNAVAILABLE, 'Service unavailable', {
        service: ErrorService.Chatwoot,
        operation: 'createConversation',
        context: { statusCode: 503 },
      });
      vi.spyOn(CopyrightController, 'submit').mockRejectedValue(appError);

      const request = createPostRequest(testData);
      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(503);
      expect(data.error).toBe('Service unavailable');
    });

    it('should handle unexpected errors with 500 status', async () => {
      vi.spyOn(CopyrightController, 'submit').mockRejectedValue(new Error('Unexpected error'));

      const request = createPostRequest(testData);
      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(HttpStatusCode.INTERNAL_SERVER_ERROR);
      expect(data.error).toBe('Internal Server Error');
    });
  });

  describe('GET', () => {
    it('should return 405 Method Not Allowed', async () => {
      const response = await GET();
      const data = await response.json();

      expect(response.status).toBe(HttpStatusCode.METHOD_NOT_ALLOWED);
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
