import type { SpanJSON, TransactionEvent } from '@sentry/core';
import * as Sentry from '@sentry/nextjs';
import { describe, expect, it, vi } from 'vitest';
import { AppError } from '@/libs/error/error';
import { AuthErrorCode, ClientErrorCode, ServerErrorCode } from '@/libs/error/error.codes';
import { ErrorCategory, ErrorService } from '@/libs/error/error.types';
import { HttpStatusCode } from '@/libs/http/http.types';
import { asOpaque } from '@/test-utils/type-assertions';
import { getSentryInitBase } from './sentry';
import { shouldDropAppErrorFromSentry } from './sentry.utils';

const TEST_PUBKY = 'ufibwbmed6jeq9k4p583go95wofakh9fwpp4k734trq79pd9u1uy';

function runBeforeSend(event: Sentry.ErrorEvent): Sentry.ErrorEvent {
  const beforeSend = getSentryInitBase().beforeSend;

  expect(beforeSend).toBeTypeOf('function');

  const result = beforeSend!(event, {} as Sentry.EventHint);

  expect(result).not.toBeNull();
  return result as Sentry.ErrorEvent;
}

function runBeforeSendTransaction(event: TransactionEvent): TransactionEvent {
  const beforeSendTransaction = getSentryInitBase().beforeSendTransaction;

  expect(beforeSendTransaction).toBeTypeOf('function');

  const result = beforeSendTransaction!(event, {} as Sentry.EventHint);

  expect(result).not.toBeNull();
  return result as TransactionEvent;
}

function runBeforeSendSpan(span: SpanJSON): SpanJSON {
  const beforeSendSpan = getSentryInitBase().beforeSendSpan;

  expect(beforeSendSpan).toBeTypeOf('function');

  return beforeSendSpan!(span);
}

async function withEnabledSentryCapture(
  run: (params: { captureAppError: (error: AppError) => void; captureException: ReturnType<typeof vi.fn> }) => void,
) {
  vi.resetModules();

  const captureException = vi.fn();
  type MockScope = {
    setTag: ReturnType<typeof vi.fn>;
    setContext: ReturnType<typeof vi.fn>;
  };
  const scope = {
    setTag: vi.fn(),
    setContext: vi.fn(),
  } satisfies MockScope;
  const withScope = vi.fn((callback: (scope: MockScope) => void) => callback(scope));

  vi.doMock('@sentry/nextjs', () => ({
    withScope,
    captureException,
  }));
  vi.doMock('@/libs/env/env', () => ({
    Env: {
      NODE_ENV: 'production',
      VITEST: undefined,
      NEXT_PUBLIC_TESTNET: false,
      NEXT_PUBLIC_SENTRY_DSN: 'https://public@example.com/1',
      NEXT_PUBLIC_SENTRY_ENVIRONMENT: 'production',
      NEXT_PUBLIC_APP_VERSION: 'test',
      NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE: 0,
    },
  }));

  try {
    const { captureAppError } = await import('./sentry');
    run({ captureAppError, captureException });
  } finally {
    vi.doUnmock('@sentry/nextjs');
    vi.doUnmock('@/libs/env/env');
    vi.resetModules();
  }
}

function createCapturedAppError({
  code,
  statusCode,
  endpoint,
  service = ErrorService.Nexus,
  operation = 'fetchNexus',
}: {
  code: ClientErrorCode;
  statusCode: number;
  endpoint: string;
  service?: ErrorService;
  operation?: string;
}): AppError {
  return new AppError({
    category: ErrorCategory.Client,
    code,
    message: 'Not Found',
    service,
    operation,
    context: { endpoint, statusCode },
  });
}

describe('shouldEnableSentry', () => {
  it('is disabled when NEXT_PUBLIC_TESTNET is true outside unit-test guards', async () => {
    vi.resetModules();
    vi.doMock('@/libs/env/env', () => ({
      Env: {
        NODE_ENV: 'production',
        VITEST: undefined,
        NEXT_PUBLIC_TESTNET: true,
        NEXT_PUBLIC_SENTRY_DSN: 'https://public@example.com/1',
      },
    }));

    try {
      const { shouldEnableSentry: shouldEnableSentryWithMockedEnv } = await import('./sentry');

      expect(shouldEnableSentryWithMockedEnv()).toBe(false);
    } finally {
      vi.doUnmock('@/libs/env/env');
      vi.resetModules();
    }
  });
});

describe('captureAppError filtering', () => {
  it('keeps OG metadata fetch errors reportable unless handled before Err creation', async () => {
    await withEnabledSentryCapture(({ captureAppError, captureException }) => {
      const error = new AppError({
        category: ErrorCategory.Server,
        code: ServerErrorCode.UNKNOWN_ERROR,
        message: 'OG metadata failed',
        service: ErrorService.NextJsServer,
        operation: 'fetchOgMetadata',
        context: { statusCode: HttpStatusCode.INTERNAL_SERVER_ERROR },
      });

      captureAppError(error);

      expect(shouldDropAppErrorFromSentry(error)).toBe(false);
      expect(captureException).toHaveBeenCalledWith(error);
    });
  });

  it('keeps OG metadata SSRF guard errors reportable', async () => {
    await withEnabledSentryCapture(({ captureAppError, captureException }) => {
      const error = new AppError({
        category: ErrorCategory.Auth,
        code: AuthErrorCode.FORBIDDEN,
        message: 'Blocked IP range',
        service: ErrorService.NextJsServer,
        operation: 'checkDnsSafety',
        context: { hostname: '169.254.169.254', statusCode: HttpStatusCode.FORBIDDEN },
      });

      captureAppError(error);

      expect(shouldDropAppErrorFromSentry(error)).toBe(false);
      expect(captureException).toHaveBeenCalledWith(error);
    });
  });

  it('drops Nexus fetchNexus post-tags 404 errors', async () => {
    await withEnabledSentryCapture(({ captureAppError, captureException }) => {
      const error = createCapturedAppError({
        code: ClientErrorCode.NOT_FOUND,
        statusCode: HttpStatusCode.NOT_FOUND,
        endpoint: `https://nexus.pubky.app/v0/post/${TEST_PUBKY}/003544WKXXGQG/tags?skip_tags=0&limit_tags=3`,
      });

      captureAppError(error);

      expect(shouldDropAppErrorFromSentry(error)).toBe(true);
      expect(captureException).not.toHaveBeenCalled();
    });
  });

  it('keeps full post 404 errors reportable', async () => {
    await withEnabledSentryCapture(({ captureAppError, captureException }) => {
      const error = createCapturedAppError({
        code: ClientErrorCode.NOT_FOUND,
        statusCode: HttpStatusCode.NOT_FOUND,
        endpoint: `https://nexus.pubky.app/v0/post/${TEST_PUBKY}/003544WKXXGQG`,
      });

      captureAppError(error);

      expect(shouldDropAppErrorFromSentry(error)).toBe(false);
      expect(captureException).toHaveBeenCalledWith(error);
    });
  });

  it('does not drop post-tags bad requests', async () => {
    await withEnabledSentryCapture(({ captureAppError, captureException }) => {
      const error = createCapturedAppError({
        code: ClientErrorCode.BAD_REQUEST,
        statusCode: HttpStatusCode.BAD_REQUEST,
        endpoint: `https://nexus.pubky.app/v0/post/${TEST_PUBKY}/003544WKXXGQG/tags?skip_tags=-1`,
      });

      captureAppError(error);

      expect(shouldDropAppErrorFromSentry(error)).toBe(false);
      expect(captureException).toHaveBeenCalledWith(error);
    });
  });

  it('does not drop non-Nexus post-tags 404 errors', () => {
    const error = createCapturedAppError({
      code: ClientErrorCode.NOT_FOUND,
      statusCode: HttpStatusCode.NOT_FOUND,
      endpoint: `https://nexus.pubky.app/v0/post/${TEST_PUBKY}/003544WKXXGQG/tags`,
      service: ErrorService.Homeserver,
    });

    expect(shouldDropAppErrorFromSentry(error)).toBe(false);
  });

  it('does not drop non-fetchNexus post-tags 404 errors', () => {
    const error = createCapturedAppError({
      code: ClientErrorCode.NOT_FOUND,
      statusCode: HttpStatusCode.NOT_FOUND,
      endpoint: `https://nexus.pubky.app/v0/post/${TEST_PUBKY}/003544WKXXGQG/tags`,
      operation: 'fetchNexusWithExpectedStatus',
    });

    expect(shouldDropAppErrorFromSentry(error)).toBe(false);
  });
});

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

describe('Sentry tracing hooks wired into init base', () => {
  it('exposes beforeSendTransaction as a function on getSentryInitBase()', () => {
    expect(getSentryInitBase().beforeSendTransaction).toBeTypeOf('function');
  });

  it('exposes beforeSendSpan as a function on getSentryInitBase()', () => {
    expect(getSentryInitBase().beforeSendSpan).toBeTypeOf('function');
  });
});

describe('Sentry transaction PII scrubbing', () => {
  it('redacts pubky-bearing transaction names, request fields, header values, and trace.data URL fields while preserving structural names', () => {
    const event = runBeforeSendTransaction(
      asOpaque<TransactionEvent>({
        type: 'transaction',
        transaction: `GET /profile/${TEST_PUBKY}`,
        request: {
          url: `https://example.com/profile/${TEST_PUBKY}`,
          method: 'GET',
          query_string: `ref=pubky://${TEST_PUBKY}/pub/post`,
          headers: {
            'X-Custom-Identity': `bearer ${TEST_PUBKY}`,
            Accept: 'application/json',
          },
        },
        contexts: {
          trace: {
            trace_id: 'abc123',
            span_id: 'def456',
            op: 'pageload',
            status: 'ok',
            data: {
              'url.full': `https://app.pubky.app/profile/${TEST_PUBKY}`,
              'http.url': `https://_pubky.${TEST_PUBKY}/pub/profile.json`,
              'http.response_code': 200,
            },
          },
          browser: { name: 'Chrome', version: '123' },
          runtime: { name: 'node', version: '24' },
        },
      }),
    );

    expect(event.transaction).toBe('GET /profile/[redacted: pubky identifier]');

    expect(event.request?.url).toBe('https://example.com/profile/[redacted: pubky identifier]');
    expect(event.request?.method).toBe('GET');
    expect(event.request?.query_string).toBe('ref=[redacted: pubky identifier]');
    expect(event.request?.headers?.['X-Custom-Identity']).toContain('[redacted: pubky identifier]');
    expect(event.request?.headers?.['Accept']).toBe('application/json');

    const traceCtx = event.contexts?.trace as Record<string, unknown>;
    const traceData = traceCtx?.data as Record<string, unknown>;
    expect(traceData['url.full']).toBe('https://app.pubky.app/profile/[redacted: pubky identifier]');
    // PUBKY_HTTP_HOST_PATTERN matches the entire `https://_pubky.<key>/...` URL up to whitespace
    // / quotes / angle brackets, so the path is consumed alongside the host. This is intentional —
    // homeserver URLs are PII end-to-end, not just at the host segment.
    expect(traceData['http.url']).toBe('[redacted: pubky identifier]');
    expect(traceData['http.response_code']).toBe(200);

    expect(traceCtx.trace_id).toBe('abc123');
    expect(traceCtx.span_id).toBe('def456');
    expect(traceCtx.op).toBe('pageload');
    expect(traceCtx.status).toBe('ok');

    const browserCtx = event.contexts?.browser as Record<string, unknown>;
    const runtimeCtx = event.contexts?.runtime as Record<string, unknown>;
    expect(browserCtx.name).toBe('Chrome');
    expect(browserCtx.version).toBe('123');
    expect(runtimeCtx.name).toBe('node');
    expect(runtimeCtx.version).toBe('24');
  });

  it('scrubs string-array values inside an opaque runtime query_string payload (defensive — not the typed Sentry contract)', () => {
    // QueryParams in @sentry/core v10.51 is `string | Record<string, string> | Array<[string, string]>`.
    // It does NOT include `Record<string, string[]>`. We use asOpaque to exercise the walker against
    // a runtime payload shape that diverges from the published TS type, since runtime serializers
    // sometimes emit array values for repeated query keys.
    const event = runBeforeSendTransaction(
      asOpaque<TransactionEvent>({
        type: 'transaction',
        request: {
          query_string: { tags: [`pubky://${TEST_PUBKY}/a`, 'safe-tag', `pubky://${TEST_PUBKY}/b`] },
        },
      }),
    );

    const queryArray = asOpaque<{ tags: string[] }>(event.request?.query_string).tags;
    expect(queryArray[0]).toBe('[redacted: pubky identifier]');
    expect(queryArray[1]).toBe('safe-tag');
    expect(queryArray[2]).toBe('[redacted: pubky identifier]');
  });

  it('applies keyed redaction to extra, user, and contexts.error.context when present', () => {
    const event = runBeforeSendTransaction(
      asOpaque<TransactionEvent>({
        type: 'transaction',
        extra: {
          displayName: 'Alice',
          url: `pubky://${TEST_PUBKY}/pub/profile.json`,
        },
        user: {
          id: TEST_PUBKY,
          email: 'alice@example.com',
        },
        contexts: {
          'error.context': {
            statusCode: 500,
            email: 'bob@example.com',
            user: { displayName: 'Bob' },
          },
        },
      }),
    );

    expect(event.extra).toEqual({
      displayName: '[redacted: sensitive field]',
      url: '[redacted: pubky identifier]',
    });
    expect(event.user).toEqual({
      id: '[redacted: pubky identifier]',
      email: '[redacted: sensitive field]',
    });

    const errorContext = event.contexts?.['error.context'] as Record<string, unknown>;
    expect(errorContext.statusCode).toBe(500);
    expect(errorContext.email).toBe('[redacted: sensitive field]');
    expect(errorContext.user).toBe('[redacted: sensitive field]');
  });

  it('does not create absent request, extra, user, or contexts fields', () => {
    const event = runBeforeSendTransaction(
      asOpaque<TransactionEvent>({ type: 'transaction', transaction: 'GET /home' }),
    );

    expect(event.request).toBeUndefined();
    expect(event.extra).toBeUndefined();
    expect(event.user).toBeUndefined();
    expect(event.contexts).toBeUndefined();
  });

  it('does not mutate event.spans (per-span scrubbing is delegated to beforeSendSpan)', () => {
    const childSpan = asOpaque<SpanJSON>({
      trace_id: 't',
      span_id: 's1',
      start_timestamp: 1,
      data: {},
      description: `pubky://${TEST_PUBKY}/pub/x`,
    });
    const event = asOpaque<TransactionEvent>({
      type: 'transaction',
      spans: [childSpan],
    });

    const result = runBeforeSendTransaction(event);

    expect(result.spans).toBe(event.spans);
    expect(result.spans?.[0]).toBe(childSpan);
    expect(childSpan.description).toBe(`pubky://${TEST_PUBKY}/pub/x`);
  });

  it('returns the same event object reference', () => {
    const event = asOpaque<TransactionEvent>({ type: 'transaction', transaction: 'GET /home' });
    expect(runBeforeSendTransaction(event)).toBe(event);
  });
});

describe('Sentry span PII scrubbing', () => {
  it('redacts pubky-bearing description and span.data string fields while preserving structural values', () => {
    const span = runBeforeSendSpan(
      asOpaque<SpanJSON>({
        trace_id: 't',
        span_id: 's',
        start_timestamp: 1,
        description: `GET pubky://${TEST_PUBKY}/pub/post`,
        data: {
          url: `pubky://${TEST_PUBKY}/pub/x`,
          'http.url': `https://_pubky.${TEST_PUBKY}/pub/x`,
          'http.query': `?author=${TEST_PUBKY}`,
          'http.fragment': `#${TEST_PUBKY}`,
          'http.target': `/profile/${TEST_PUBKY}`,
          'db.statement': `SELECT * FROM posts WHERE author = '${TEST_PUBKY}'`,
          'http.method': 'GET',
          'http.response_code': 200,
          is_segment: true,
        },
      }),
    );

    expect(span.description).toBe('GET [redacted: pubky identifier]');
    const data = span.data as Record<string, unknown>;
    expect(data.url).toBe('[redacted: pubky identifier]');
    // `https://_pubky.<key>/pub/x` is fully consumed by PUBKY_HTTP_HOST_PATTERN — see comment in
    // the transaction test for `http.url`. Path segments after the host are still PII.
    expect(data['http.url']).toBe('[redacted: pubky identifier]');
    expect(data['http.query']).toBe('?author=[redacted: pubky identifier]');
    expect(data['http.fragment']).toBe('#[redacted: pubky identifier]');
    expect(data['http.target']).toBe('/profile/[redacted: pubky identifier]');
    expect(data['db.statement']).toBe("SELECT * FROM posts WHERE author = '[redacted: pubky identifier]'");
    expect(data['http.method']).toBe('GET');
    expect(data['http.response_code']).toBe(200);
    expect(data.is_segment).toBe(true);
  });

  it('scrubs string arrays inside span.data element-by-element', () => {
    const span = runBeforeSendSpan(
      asOpaque<SpanJSON>({
        trace_id: 't',
        span_id: 's',
        start_timestamp: 1,
        data: {
          urls: [`pubky://${TEST_PUBKY}/a`, 'https://example.com/safe', `pubky://${TEST_PUBKY}/b`],
        },
      }),
    );

    const urls = (span.data as { urls: string[] }).urls;
    expect(urls[0]).toBe('[redacted: pubky identifier]');
    expect(urls[1]).toBe('https://example.com/safe');
    expect(urls[2]).toBe('[redacted: pubky identifier]');
  });

  it('preserves object identity for aliased data subtrees and applies first-pass scrub via shared mutation', () => {
    const aliased = { url: `pubky://${TEST_PUBKY}/profile.json` };
    const span = runBeforeSendSpan(
      asOpaque<SpanJSON>({
        trace_id: 't',
        span_id: 's',
        start_timestamp: 1,
        data: { first: aliased, second: aliased },
      }),
    );

    const data = asOpaque<{ first: { url: string }; second: { url: string } }>(span.data);
    expect(data.first).toBe(data.second);
    expect(data.first.url).toBe('[redacted: pubky identifier]');
  });

  it('does not throw on circular references inside span.data and still scrubs reachable strings', () => {
    const cycle: Record<string, unknown> = { url: `pubky://${TEST_PUBKY}/a` };
    cycle.self = cycle;
    const span = asOpaque<SpanJSON>({
      trace_id: 't',
      span_id: 's',
      start_timestamp: 1,
      data: cycle,
    });

    expect(() => runBeforeSendSpan(span)).not.toThrow();
    expect((cycle as { url: string }).url).toBe('[redacted: pubky identifier]');
    expect(cycle.self).toBe(cycle);
  });

  it('returns the same span object reference', () => {
    const span = asOpaque<SpanJSON>({ trace_id: 't', span_id: 's', start_timestamp: 1, data: {} });
    expect(runBeforeSendSpan(span)).toBe(span);
  });
});
