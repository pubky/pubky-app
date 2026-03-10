import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ErrorCategory, ErrorService, TimeoutErrorCode, ServerErrorCode, HttpStatusCode } from '@/libs';
import { NextJsApiService } from './nextjs';

describe('NextJsApiService', () => {
  const mockFetch = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = mockFetch;
  });

  it('should throw timeout error when request exceeds time limit', async () => {
    const abortError = new Error('The operation was aborted');
    abortError.name = 'AbortError';
    mockFetch.mockRejectedValueOnce(abortError);

    await expect(NextJsApiService.fetch('https://example.com/slow')).rejects.toMatchObject({
      category: ErrorCategory.Timeout,
      code: TimeoutErrorCode.REQUEST_TIMEOUT,
      service: ErrorService.NextJsServer,
      context: { url: 'https://example.com/slow', statusCode: HttpStatusCode.REQUEST_TIMEOUT },
    });
  });

  it('should throw server error for non-abort fetch failures', async () => {
    const fetchError = new TypeError('Failed to fetch');
    mockFetch.mockRejectedValueOnce(fetchError);

    await expect(NextJsApiService.fetch('https://example.com/fail')).rejects.toMatchObject({
      category: ErrorCategory.Server,
      code: ServerErrorCode.UNKNOWN_ERROR,
      service: ErrorService.NextJsServer,
      cause: fetchError,
      context: { url: 'https://example.com/fail', statusCode: HttpStatusCode.INTERNAL_SERVER_ERROR },
    });
  });
});
