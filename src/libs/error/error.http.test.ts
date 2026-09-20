import { describe, expect, it } from 'vitest';
import { ClientErrorCode, RateLimitErrorCode } from '@/libs/error/error.codes';
import { ErrorCategory, ErrorService } from '@/libs/error/error.types';
import { HttpStatusCode } from '@/libs/http/http.types';
import { claimRateLimitReport, httpResponseToError } from './error.http';

const MINUTE_MS = 60_000;
const T0 = Date.parse('2026-09-16T12:00:00.000Z');

const rateLimitedResponse = () =>
  new Response(null, {
    status: HttpStatusCode.TOO_MANY_REQUESTS,
    statusText: 'Too Many Requests',
    headers: { 'retry-after': '7' },
  });

describe('claimRateLimitReport', () => {
  it('claims the first report for a service and operation', () => {
    expect(claimRateLimitReport(ErrorService.Nexus, 'claimFirst', T0)).toBe(true);
  });

  it('suppresses a repeat inside the window and reports again after it', () => {
    const operation = 'claimWindow';

    expect(claimRateLimitReport(ErrorService.Nexus, operation, T0)).toBe(true);
    expect(claimRateLimitReport(ErrorService.Nexus, operation, T0 + MINUTE_MS - 1)).toBe(false);
    expect(claimRateLimitReport(ErrorService.Nexus, operation, T0 + MINUTE_MS)).toBe(true);
  });

  it('scopes the window to one service and operation', () => {
    expect(claimRateLimitReport(ErrorService.Nexus, 'claimScoped', T0)).toBe(true);
    expect(claimRateLimitReport(ErrorService.Nexus, 'claimScopedOther', T0)).toBe(true);
    expect(claimRateLimitReport(ErrorService.Homeserver, 'claimScoped', T0)).toBe(true);
  });

  it('keeps the remembered key count bounded', () => {
    // Filling past the cap evicts the oldest key, so an operation reported long ago
    // starts a fresh window instead of leaking entries forever.
    for (let i = 0; i < 120; i++) claimRateLimitReport(ErrorService.Nexus, `claimBounded${i}`, T0);

    expect(claimRateLimitReport(ErrorService.Nexus, 'claimBounded0', T0)).toBe(true);
  });
});

describe('httpResponseToError 429 reporting', () => {
  const url = 'https://nexus.pubky.app/v0/hot';

  it('reports the first 429 and tags repeats of the same operation', () => {
    const first = httpResponseToError(rateLimitedResponse(), ErrorService.Nexus, 'wiringRepeat', url);
    const repeat = httpResponseToError(rateLimitedResponse(), ErrorService.Nexus, 'wiringRepeat', url);

    expect(first.category).toBe(ErrorCategory.RateLimit);
    expect(first.code).toBe(RateLimitErrorCode.RATE_LIMITED);
    expect(first.context?.retryAfter).toBe(7);
    expect(first.context?.reportSuppressed).toBeUndefined();

    // The repeat is still a full AppError: only the Sentry report is suppressed.
    expect(repeat.category).toBe(ErrorCategory.RateLimit);
    expect(repeat.code).toBe(RateLimitErrorCode.RATE_LIMITED);
    expect(repeat.context?.retryAfter).toBe(7);
    expect(repeat.context?.reportSuppressed).toBe(true);
  });

  it('does not tag other statuses for the same operation', () => {
    const notFound = httpResponseToError(
      new Response(null, { status: HttpStatusCode.NOT_FOUND }),
      ErrorService.Nexus,
      'wiringOtherStatus',
      url,
    );

    expect(notFound.code).toBe(ClientErrorCode.NOT_FOUND);
    expect(notFound.context?.reportSuppressed).toBeUndefined();
  });
});
