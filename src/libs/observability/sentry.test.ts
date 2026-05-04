import * as Sentry from '@sentry/nextjs';
import { describe, expect, it } from 'vitest';
import { getSentryInitBase } from './sentry';
import { asOpaque } from '@/test-utils/type-assertions';

const TEST_PUBKY = 'ufibwbmed6jeq9k4p583go95wofakh9fwpp4k734trq79pd9u1uy';

function runBeforeSend(event: Sentry.ErrorEvent): Sentry.ErrorEvent {
  const beforeSend = getSentryInitBase().beforeSend;

  expect(beforeSend).toBeTypeOf('function');

  const result = beforeSend!(event, {} as Sentry.EventHint);

  expect(result).not.toBeNull();
  return result as Sentry.ErrorEvent;
}

describe('Sentry PII scrubbing', () => {
  it('redacts identifiers from messages, exception values, and breadcrumb messages', () => {
    const event = runBeforeSend(
      asOpaque<Sentry.ErrorEvent>({
        message: `Failed for pubky://${TEST_PUBKY}/pub/profile.json, john@example.com, +1 555-123-4567`,
        exception: {
          values: [
            {
              type: 'Error',
              value: `Homeserver failed for ${TEST_PUBKY}`,
            },
          ],
        },
        breadcrumbs: [
          {
            message: `Contact john@example.com about pubky://${TEST_PUBKY}/pub/file`,
          },
        ],
      }),
    );

    expect(event.message).toContain('[redacted: pubky identifier]');
    expect(event.message).toContain('[redacted: email]');
    expect(event.message).toContain('[redacted: phone]');
    expect(event.message).not.toContain(TEST_PUBKY);
    expect(event.message).not.toContain('john@example.com');
    expect(event.message).not.toContain('555-123-4567');

    expect(event.exception?.values?.[0]?.value).toBe('Homeserver failed for [redacted: pubky identifier]');
    expect(event.breadcrumbs?.[0]?.message).toContain('[redacted: email]');
    expect(event.breadcrumbs?.[0]?.message).toContain('[redacted: pubky identifier]');
  });

  it('redacts app-controlled error context while preserving safe operational fields', () => {
    const event = runBeforeSend(
      asOpaque<Sentry.ErrorEvent>({
        contexts: {
          browser: {
            name: 'Chrome',
            version: '123',
          },
          'error.context': {
            statusCode: 422,
            user: {
              name: 'Alice',
              bio: 'Private bio',
              image: 'avatar.png',
            },
            file: {
              name: 'passport.png',
              size: 12345,
            },
            pubky: TEST_PUBKY,
            email: 'alice@example.com',
            phoneNumber: '+1 555-123-4567',
            endpoint: `https://_pubky.${TEST_PUBKY}/pub/pubky.app/profile.json`,
            copyrightEmailField: {
              field: 'email',
              value: 'alice@example.com',
            },
          },
        },
      }),
    );

    const browserContext = event.contexts?.browser as Record<string, unknown>;
    const errorContext = event.contexts?.['error.context'] as Record<string, unknown>;

    expect(browserContext.name).toBe('Chrome');
    expect(errorContext.statusCode).toBe(422);
    expect(errorContext.user).toBe('[redacted: sensitive field]');
    expect(errorContext.file).toBe('[redacted: sensitive field]');
    expect(errorContext.pubky).toBe('[redacted: sensitive field]');
    expect(errorContext.email).toBe('[redacted: sensitive field]');
    expect(errorContext.phoneNumber).toBe('[redacted: sensitive field]');
    expect(errorContext.endpoint).toBe('[redacted: pubky identifier]');
    expect(errorContext.copyrightEmailField).toEqual({
      field: 'email',
      value: '[redacted: sensitive field]',
    });
  });

  it('redacts sensitive keys inside breadcrumb data and extra payloads', () => {
    const event = runBeforeSend(
      asOpaque<Sentry.ErrorEvent>({
        breadcrumbs: [
          {
            message: 'Logger details',
            data: {
              email: 'chatwoot-contact@example.com',
              userId: TEST_PUBKY,
              statusCode: 500,
            },
          },
        ],
        extra: {
          displayName: 'Alice',
          url: `pubky://${TEST_PUBKY}/pub/pubky.app/posts/post-id`,
        },
        request: {
          url: `https://example.com/profile/${TEST_PUBKY}`,
        },
        user: {
          id: TEST_PUBKY,
          email: 'alice@example.com',
        },
      }),
    );

    expect(event.breadcrumbs?.[0]?.data).toEqual({
      email: '[redacted: sensitive field]',
      userId: '[redacted: sensitive field]',
      statusCode: 500,
    });
    expect(event.extra).toEqual({
      displayName: '[redacted: sensitive field]',
      url: '[redacted: pubky identifier]',
    });
    expect(event.request?.url).toBe('https://example.com/profile/[redacted: pubky identifier]');
    expect(event.user).toEqual({
      id: '[redacted: pubky identifier]',
      email: '[redacted: sensitive field]',
    });
  });
});
