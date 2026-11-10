import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NetworkErrorCode, TimeoutErrorCode } from '@/libs/error/error.codes';
import { Err } from '@/libs/error/error.factories';
import { ErrorCategory } from '@/libs/error/error.types';
import { pubchiErrorCopy, pubchiQueryErrorCode } from '@/libs/pubchi/error-copy';
import { PUBCHI_ERROR_CODES } from '@/libs/pubchi/error-copy';
import type { Phase0Purpose, RequestObjectV2 } from '@/libs/pubchi/schemas/request';
import { resetRuntimeConfigForTests } from '@/libs/runtime-config/runtime-config';
import { PUBKY_RUNTIME_ENV_NAMES } from '@/libs/runtime-config/runtime-config.schema';
import { mockResponse } from '@/test-utils/dom';
import { asOpaque } from '@/test-utils/type-assertions';
import { PubchiService } from './pubchi';

const OWNER = 'o1gg96ewuojmopcjbz8895478wdtxtzzuxnfjjz8o8e77csa1ngo';
const BOT = OWNER;

const FEED_PROPOSAL = {
  schema: 'pubchi-feed-proposal',
  version: 1,
  bot: BOT,
  owner: OWNER,
  generated_at: 10,
  feed: {
    name: 'Builders',
    created_at: 10,
    feed: {
      tags: ['builder'],
      reach: 'following',
      layout: 'columns',
      sort: 'recent',
    },
  },
  warnings: [],
  installed_user_feed_id: null,
};

function setPubchiEnv(enabled = 'true', apiUrl = 'https://pubchi.example.com') {
  process.env[PUBKY_RUNTIME_ENV_NAMES.pubchiEnabled] = enabled;
  process.env[PUBKY_RUNTIME_ENV_NAMES.pubchiApiUrl] = apiUrl;
  resetRuntimeConfigForTests();
}

function request(purpose: Phase0Purpose): RequestObjectV2 {
  return {
    schema: 'pubchi-request-object-v2',
    version: 2,
    audience: 'https://pubchi.example.com',
    asker: OWNER,
    bot: BOT,
    key_generation: 1,
    purpose: purpose as RequestObjectV2['purpose'],
    body_sha256: 'a'.repeat(64),
    issued_at: 1,
    expires_at: 601,
    nonce: 'b'.repeat(64),
    signature: 'c'.repeat(128),
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return mockResponse({
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(body),
    headers: asOpaque<Headers>({ get: () => null }),
  });
}

describe('PubchiService', () => {
  beforeEach(() => {
    setPubchiEnv();
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    delete process.env[PUBKY_RUNTIME_ENV_NAMES.pubchiEnabled];
    delete process.env[PUBKY_RUNTIME_ENV_NAMES.pubchiApiUrl];
    resetRuntimeConfigForTests();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('POSTs who-tagged-me to /v1/query', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({ schema: 'pubchi-query-result' }));
    await PubchiService.query({ request: request('who-tagged-me'), body: { question: 'who tagged me?' } });
    expect(fetch).toHaveBeenCalledOnce();
    expect(vi.mocked(fetch).mock.calls[0][0]).toBe('https://pubchi.example.com/v1/query');
    expect(vi.mocked(fetch).mock.calls[0][1]?.method).toBe('POST');
    expect(vi.mocked(fetch).mock.calls[0][1]?.credentials).toBe('omit');
  });

  it('POSTs build-feed to /v1/feed and returns FeedProposalV1 JSON', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(FEED_PROPOSAL));
    const parsed = await PubchiService.query({
      request: request('build-feed'),
      body: { question: 'build a feed of builders' },
    });
    expect(vi.mocked(fetch).mock.calls[0][0]).toBe('https://pubchi.example.com/v1/feed');
    expect(parsed).toEqual(FEED_PROPOSAL);
  });

  it('surfaces a runtime error code from a non-ok response body', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({ error: 'BUDGET_EXCEEDED' }, 429));

    await expect(
      PubchiService.query({ request: request('who-tagged-me'), body: { question: 'who tagged me?' } }),
    ).rejects.toThrow('BUDGET_EXCEEDED');
  });

  it('preserves a network AppError and maps it to safe connection recovery copy with one report', async () => {
    const report = vi.spyOn(Err, 'network');
    vi.mocked(fetch).mockRejectedValueOnce(new TypeError('Failed to fetch https://private.example/query'));

    const error = await PubchiService.query({ request: request('ask'), body: { question: 'What changed?' } }).catch(
      (caught: unknown) => caught,
    );

    expect(error).toMatchObject({ category: ErrorCategory.Network, code: NetworkErrorCode.CONNECTION_FAILED });
    expect(report).toHaveBeenCalledOnce();
    expect(error).toBe(report.mock.results[0].value);
    expect(pubchiErrorCopy(pubchiQueryErrorCode(error))).toEqual({
      message: "I couldn't reach the Pubchi service. Check your connection and try again in a minute.",
      supportCode: 'CONNECTION_FAILED',
    });
  });

  it('maps its request timer to retry guidance while preserving the single safeFetch AppError', async () => {
    vi.useFakeTimers();
    const report = vi.spyOn(Err, 'timeout');
    vi.mocked(fetch).mockImplementationOnce(
      (_url, options) =>
        new Promise((_resolve, reject) => {
          options?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
        }),
    );
    const pending = PubchiService.query(
      { request: request('ask'), body: { question: 'What changed?' } },
      new AbortController().signal,
    ).catch((caught: unknown) => caught);

    await vi.advanceTimersByTimeAsync(30_000);
    const error = await pending;

    expect(error).toMatchObject({ category: ErrorCategory.Timeout, code: TimeoutErrorCode.REQUEST_ABORTED });
    expect(report).toHaveBeenCalledOnce();
    expect(error).toBe(report.mock.results[0].value);
    expect(pubchiErrorCopy(pubchiQueryErrorCode(error))).toEqual({
      message: "I couldn't reach the Pubchi service. Check your connection and try again in a minute.",
      supportCode: 'REQUEST_TIMEOUT',
    });
  });

  it('aborts the HTTP request on external cancellation without serializing the signal, then accepts a fresh request', async () => {
    const controller = new AbortController();
    vi.mocked(fetch).mockImplementationOnce(
      (_url, options) =>
        new Promise((_resolve, reject) => {
          options?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
        }),
    );
    const payload = { request: request('ask'), body: { question: 'What changed?' } };
    const pending = PubchiService.query(payload, controller.signal).catch((error: unknown) => error);
    const transportSignal = vi.mocked(fetch).mock.calls[0][1]?.signal;

    controller.abort();

    expect(transportSignal?.aborted).toBe(true);
    await expect(pending).resolves.toMatchObject({ name: 'AbortError' });
    expect(JSON.parse(String(vi.mocked(fetch).mock.calls[0][1]?.body))).toEqual(payload);
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({ answer: 'Fresh answer' }));
    await expect(PubchiService.query(payload, new AbortController().signal)).resolves.toEqual({
      answer: 'Fresh answer',
    });
  });

  it('does not send an already canceled query', async () => {
    const controller = new AbortController();
    controller.abort();

    await expect(
      PubchiService.query({ request: request('ask'), body: { question: 'What changed?' } }, controller.signal),
    ).rejects.toMatchObject({ name: 'AbortError' });

    expect(fetch).not.toHaveBeenCalled();
  });

  it('rejects a response body that completes after external cancellation', async () => {
    const controller = new AbortController();
    const body = Promise.withResolvers<string>();
    const readBody = vi.fn(() => body.promise);
    vi.mocked(fetch).mockResolvedValueOnce(mockResponse({ ok: true, headers: new Headers(), text: readBody }));
    const pending = PubchiService.query(
      { request: request('ask'), body: { question: 'What changed?' } },
      controller.signal,
    ).catch((error: unknown) => error);
    await vi.waitFor(() => expect(readBody).toHaveBeenCalledOnce());

    controller.abort();
    body.resolve(JSON.stringify({ answer: 'Too late' }));

    await expect(pending).resolves.toMatchObject({ name: 'AbortError' });
  });

  it('gives retry guidance if reading the response body aborts', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      mockResponse({
        ok: true,
        status: 200,
        headers: new Headers(),
        text: async () => {
          throw new DOMException('Aborted', 'AbortError');
        },
      }),
    );

    const error = await PubchiService.query({ request: request('ask'), body: { question: 'What changed?' } }).catch(
      (caught: unknown) => caught,
    );

    expect(error).toMatchObject({ category: ErrorCategory.Timeout, code: TimeoutErrorCode.REQUEST_TIMEOUT });
    expect(pubchiQueryErrorCode(error)).toBe('REQUEST_TIMEOUT');
  });

  it.each(PUBCHI_ERROR_CODES)('preserves the closed server code %s as structured metadata', async (code) => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({ error: { code, message: 'private backend detail' } }, 400));

    const error = await PubchiService.query({ request: request('ask'), body: { question: 'What changed?' } }).catch(
      (caught: unknown) => caught,
    );

    expect(error).toMatchObject({ context: { pubchiCode: code } });
    expect(pubchiQueryErrorCode(error)).toBe(code);
    expect(JSON.stringify(pubchiErrorCopy(pubchiQueryErrorCode(error)))).not.toContain('private backend detail');
  });

  it('keeps unknown backend errors out of the public message and support code', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({ error: 'private backend detail' }, 500));

    const error = await PubchiService.query({ request: request('ask'), body: { question: 'What changed?' } }).catch(
      (caught: unknown) => caught,
    );

    expect(pubchiErrorCopy(pubchiQueryErrorCode(error))).toEqual({
      message: "I couldn't reach the Pubchi service. Check your connection and try again in a minute.",
      supportCode: 'PUBCHI_UNAVAILABLE',
    });
  });

  it.each(['what-i-missed', 'summarize'] as const)('does not send %s', async (purpose) => {
    await expect(PubchiService.query({ request: request(purpose), body: { question: purpose } })).rejects.toThrow(
      'PURPOSE_UNSUPPORTED',
    );
    expect(fetch).not.toHaveBeenCalled();
  });
});
