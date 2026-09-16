import { afterEach, describe, expect, it, vi } from 'vitest';
import { Logger } from '@/libs/logger/logger';
import { fetchWithValidation, resolveMentionSegmentsForMetadata, resolveMentionsForMetadata } from './postMetadata';

describe('fetchWithValidation', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  const jsonResponse = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

  it('bounds the Nexus fetch with a timeout signal (crawlers abandon slow link previews)', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({ id: 'u1' }));

    await fetchWithValidation('https://nexus.test/v0/user/u1', 'fetchUserDetails');

    const init = fetchSpy.mock.calls[0][1];
    expect(init?.signal).toBeInstanceOf(AbortSignal);
    expect(init?.next?.revalidate).toBe(3600);
  });

  it('returns the parsed body on success', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({ id: 'u1' }));

    expect(await fetchWithValidation('https://nexus.test/v0/user/u1', 'fetchUserDetails')).toEqual({ id: 'u1' });
  });

  it('returns null on 404 so callers can fall back in a single guard', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('Not Found', { status: 404 }));

    expect(await fetchWithValidation('https://nexus.test/v0/user/u1', 'fetchUserDetails')).toBeNull();
  });

  it('throws a typed error on other non-ok statuses', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('boom', { status: 502 }));

    await expect(fetchWithValidation('https://nexus.test/v0/user/u1', 'fetchUserDetails')).rejects.toThrow();
  });

  it('propagates a timeout abort as a rejection (so the OG fallback engages instead of hanging)', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new DOMException('The operation was aborted', 'TimeoutError'));

    await expect(fetchWithValidation('https://nexus.test/v0/user/u1', 'fetchUserDetails')).rejects.toThrow();
  });
});

describe('resolveMentionsForMetadata', () => {
  // Valid 52-char lowercase alphanumeric keys for testing
  const PUBKY_A = 'abcdefghijklmnopqrstuvwxyz0123456789abcdefghijklmnop';
  const PUBKY_B = 'zyxwvutsrqponmlkjihgfedcba9876543210zyxwvutsrqponmlk';
  const SHORT_A = 'ABCD...MNOP';
  const VISIBLE = 200;

  const jsonResponse = (body: unknown) =>
    new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns the text unchanged without any Nexus request when there are no mentions', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    expect(await resolveMentionsForMetadata('hello world', VISIBLE)).toBe('hello world');
    expect(await resolveMentionsForMetadata('', VISIBLE)).toBe('');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('swaps pk: and pubky mentions for @name, fetching each mentioned profile once under the short budget', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(jsonResponse({ id: PUBKY_A, name: 'Alice' }))
      .mockResolvedValueOnce(jsonResponse({ id: PUBKY_B, name: 'Bob' }));

    const text = await resolveMentionsForMetadata(
      `pk:${PUBKY_A} met pubky${PUBKY_B}, then pk:${PUBKY_A} left`,
      VISIBLE,
    );

    expect(text).toBe('@Alice met @Bob, then @Alice left');
    expect(fetchSpy.mock.calls.map(([url]) => url)).toEqual([
      `https://nexus.staging.pubky.app/v0/user/${PUBKY_A}/details`,
      `https://nexus.staging.pubky.app/v0/user/${PUBKY_B}/details`,
    ]);
    const init = fetchSpy.mock.calls[0][1];
    expect(init?.signal).toBeInstanceOf(AbortSignal);
    expect(init?.next?.revalidate).toBe(3600);
  });

  it('shows the shortened key, silently, for a profile Nexus does not know (404)', async () => {
    const warnSpy = vi.spyOn(Logger, 'warn').mockImplementation(() => {});
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('Not Found', { status: 404 }));

    expect(await resolveMentionsForMetadata(`pk:${PUBKY_A} hi`, VISIBLE)).toBe(`${SHORT_A} hi`);
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('shows the shortened key for a profile without a name (as PostMentions does)', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({ id: PUBKY_A, name: '' }));

    expect(await resolveMentionsForMetadata(`pk:${PUBKY_A} hi`, VISIBLE)).toBe(`${SHORT_A} hi`);
  });

  it('treats a Nexus error as a miss: one warning, no AppError, no Sentry capture', async () => {
    const warnSpy = vi.spyOn(Logger, 'warn').mockImplementation(() => {});
    const errorSpy = vi.spyOn(Logger, 'error').mockImplementation(() => {});
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response('boom', { status: 503 }))
      .mockResolvedValueOnce(jsonResponse({ id: PUBKY_B, name: 'Bob' }));

    const text = await resolveMentionsForMetadata(`pk:${PUBKY_A} and pk:${PUBKY_B}`, VISIBLE);

    expect(text).toBe(`${SHORT_A} and @Bob`);
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('degrades a timed-out lookup to the shortened key instead of failing the whole preview', async () => {
    const warnSpy = vi.spyOn(Logger, 'warn').mockImplementation(() => {});
    vi.spyOn(globalThis, 'fetch')
      .mockRejectedValueOnce(new DOMException('The operation was aborted', 'TimeoutError'))
      .mockResolvedValueOnce(jsonResponse({ id: PUBKY_B, name: 'Bob' }));

    const text = await resolveMentionsForMetadata(`pk:${PUBKY_A} and pk:${PUBKY_B}`, VISIBLE);

    expect(text).toBe(`${SHORT_A} and @Bob`);
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });

  it('bounds the Nexus fan-out: mentions past the lookup limit render as shortened keys', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async (url) => jsonResponse({ id: String(url).split('/').at(-2), name: 'Named' }));
    // 11 distinct keys: PUBKY_A with its last character varied, then PUBKY_B last.
    const keys = [...'0123456789'].map((digit) => `${PUBKY_A.slice(0, -1)}${digit}`).concat(PUBKY_B);

    const text = await resolveMentionsForMetadata(keys.map((key) => `pk:${key}`).join(' '), VISIBLE);

    expect(fetchSpy).toHaveBeenCalledTimes(10);
    expect(text).toBe(`${Array(10).fill('@Named').join(' ')} ZYXW...NMLK`);
  });

  it('does not look up a mention that cannot appear within the visible window', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({ id: PUBKY_A, name: 'Alice' }));
    const content = `${'x'.repeat(VISIBLE)} pk:${PUBKY_A}`;

    const text = await resolveMentionsForMetadata(content, VISIBLE);

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(text).toBe(`${'x'.repeat(VISIBLE)} ${SHORT_A}`);
  });

  it('exposes the same resolution as runs flagged for styling', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(jsonResponse({ id: PUBKY_A, name: 'Alice' }))
      .mockResolvedValueOnce(new Response('Not Found', { status: 404 }));

    expect(await resolveMentionSegmentsForMetadata(`hi pk:${PUBKY_A} and pk:${PUBKY_B}!`, VISIBLE)).toEqual([
      { text: 'hi ', isMention: false },
      { text: '@Alice', isMention: true, pubky: PUBKY_A },
      { text: ' and ', isMention: false },
      { text: 'ZYXW...NMLK', isMention: true, pubky: PUBKY_B },
      { text: '!', isMention: false },
    ]);
  });
});
