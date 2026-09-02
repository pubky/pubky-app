import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchWithValidation } from './postMetadata';

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
