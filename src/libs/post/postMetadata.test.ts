import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchUserAndPostForMetadata, fetchWithValidation } from './postMetadata';

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

describe('fetchUserAndPostForMetadata identifier normalization', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  const jsonResponse = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

  const okUser = { id: 'u1', name: 'Alice' };
  const okPost = { id: 'p1', author: 'u1' };

  it('trims trailing dots and whitespace from crawl-mangled ids and decodes percent-encoding', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes('/post/')) return jsonResponse(okPost);
      return jsonResponse(okUser);
    });
    const okPost = { id: 'p1', author: 'u1' };

    // Trailing dot on the user id, percent-encoded dot on the post id, as
    // crawlers mangle them (PUBKY-APP-1E/9Z/A0/BQ).
    const result = await fetchUserAndPostForMetadata('u1.', 'p1.');
    

    expect(result).toEqual({ user: okUser, post: okPost });
    const calledUrls = fetchSpy.mock.calls.map((call) => String(call[0]));
    expect(calledUrls.some((u) => u.includes('/user/u1/details'))).toBe(true);
    expect(calledUrls.some((u) => u.includes('/post/u1/p1/details'))).toBe(true);
    expect(calledUrls.some((u) => /[.\s]\?|\.$/.test(u))).toBe(false);
  });

  it('decodes a fully percent-encoded identifier before trimming', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes('/post/')) return jsonResponse(okPost);
      return jsonResponse(okUser);
    });

    // '%70%31%2E' === 'p1.' — bots sometimes percent-encode the whole id.
    await fetchUserAndPostForMetadata('u1', '%70%31%2E');

    const calledUrls = fetchSpy.mock.calls.map((call) => String(call[0]));
    expect(calledUrls.some((u) => u.includes('/post/u1/p1/details'))).toBe(true);
  });

  it('leaves already-clean identifiers unchanged', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes('/post/')) return jsonResponse(okPost);
      return jsonResponse(okUser);
    });

    await fetchUserAndPostForMetadata('u1', 'p1');

    const calledUrls = fetchSpy.mock.calls.map((call) => String(call[0]));
    expect(calledUrls.some((u) => u.includes('/user/u1'))).toBe(true);
    expect(calledUrls.some((u) => u.includes('/post/u1/p1/details'))).toBe(true);
  });
});
