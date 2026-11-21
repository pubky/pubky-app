import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FAVICON_MAX_BYTES, NextJsFaviconService } from './favicon';

const { mockCheckDnsSafety } = vi.hoisted(() => ({
  mockCheckDnsSafety: vi.fn<(hostname: string) => Promise<{ ok: boolean; reason?: string }>>(),
}));

vi.mock('../nextjs.utils', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../nextjs.utils')>();
  return { ...actual, checkDnsSafety: mockCheckDnsSafety };
});

// The link preview's guarded dispatcher is a real socket agent; the tests stub `fetch` itself.
vi.mock('../og-metadata/og-metadata', () => ({ SAFE_OG_METADATA_DISPATCHER: { guarded: true } }));

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00]);
const PRIVATE_HOSTS = new Set(['internal.example', 'internal.cdn.example', '10.0.0.5', '169.254.169.254']);

const mockFetch = vi.fn<(url: URL, init: RequestInit & { dispatcher?: unknown }) => Promise<Response>>();

const image = (body: BodyInit, headers: Record<string, string> = { 'content-type': 'image/png' }) =>
  new Response(body, { status: 200, headers });
const redirect = (location: string) => new Response(null, { status: 302, headers: { location } });

beforeEach(() => {
  mockFetch.mockReset();
  mockCheckDnsSafety.mockReset();
  mockCheckDnsSafety.mockImplementation(async (hostname) =>
    PRIVATE_HOSTS.has(hostname) ? { ok: false, reason: 'unsafe_ip' } : { ok: true },
  );
  vi.stubGlobal('fetch', mockFetch);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('NextJsFaviconService.fetch', () => {
  it('serves a raster icon as the type its bytes are, through the guarded dispatcher', async () => {
    mockFetch.mockResolvedValueOnce(image(PNG, { 'content-type': 'image/x-icon' }));

    const icon = await NextJsFaviconService.fetch(new URL('https://open.spotify.com/favicon.ico'));

    expect(icon?.contentType).toBe('image/png');
    expect(new Uint8Array(icon!.body)).toEqual(PNG);
    const [url, init] = mockFetch.mock.calls[0];
    expect(String(url)).toBe('https://open.spotify.com/favicon.ico');
    expect(init.dispatcher).toEqual({ guarded: true });
    expect(init.redirect).toBe('manual');
    expect(init.credentials).toBe('omit');
    // Nothing of the viewer's request is passed on: no cookie, authorization or forwarded address.
    const headers = new Headers(init.headers);
    expect([...headers.keys()].sort()).toEqual(['accept', 'user-agent']);
  });

  it('never asks a host whose addresses are private', async () => {
    await expect(NextJsFaviconService.fetch(new URL('https://internal.example/favicon.ico'))).resolves.toBeNull();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('checks every redirect hop and stops at one to a private address', async () => {
    mockFetch.mockResolvedValueOnce(redirect('https://internal.cdn.example/latest/meta-data'));

    await expect(NextJsFaviconService.fetch(new URL('https://cdn.example/favicon.ico'))).resolves.toBeNull();
    expect(mockCheckDnsSafety).toHaveBeenCalledWith('internal.cdn.example');
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['another site', 'https://evil.example/favicon.ico'],
    ['an IP address', 'https://169.254.169.254/latest/meta-data'],
    ['plain http', 'http://www.example.com/favicon.ico'],
    ['another port', 'https://www.example.com:8443/favicon.ico'],
    ['another tenant of a shared hosting domain', 'https://mallory.github.io/x.png'],
  ])('follows no redirect to %s', async (_case, location) => {
    mockFetch.mockResolvedValueOnce(redirect(location));
    const source = location.includes('github.io')
      ? 'https://alice.github.io/favicon.ico'
      : 'https://example.com/favicon.ico';

    await expect(NextJsFaviconService.fetch(new URL(source))).resolves.toBeNull();
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('follows a redirect within the site, to its www host or another subdomain', async () => {
    mockFetch
      .mockResolvedValueOnce(redirect('https://www.example.com/favicon.ico'))
      .mockResolvedValueOnce(redirect('https://static.example.com/icons/favicon.png'))
      .mockResolvedValueOnce(image(PNG));

    const icon = await NextJsFaviconService.fetch(new URL('https://example.com/favicon.ico'));

    expect(icon?.contentType).toBe('image/png');
    expect(mockFetch.mock.calls.map(([url]) => String(url))).toEqual([
      'https://example.com/favicon.ico',
      'https://www.example.com/favicon.ico',
      'https://static.example.com/icons/favicon.png',
    ]);
  });

  it('follows a public redirect, and refuses non-web schemes and credentials in one', async () => {
    mockFetch.mockResolvedValueOnce(redirect('/static/icon.png')).mockResolvedValueOnce(image(PNG));
    const followed = await NextJsFaviconService.fetch(new URL('https://www.example.com/favicon.ico'));
    expect(followed?.contentType).toBe('image/png');
    expect(String(mockFetch.mock.calls[1][0])).toBe('https://www.example.com/static/icon.png');

    mockFetch.mockReset();
    mockFetch.mockResolvedValueOnce(redirect('file:///etc/passwd'));
    await expect(NextJsFaviconService.fetch(new URL('https://a.example/favicon.ico'))).resolves.toBeNull();
    expect(mockFetch).toHaveBeenCalledTimes(1);

    mockFetch.mockReset();
    mockFetch.mockResolvedValueOnce(redirect('https://user:pass@www.a.example/favicon.ico'));
    await expect(NextJsFaviconService.fetch(new URL('https://a.example/favicon.ico'))).resolves.toBeNull();
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('gives up after three redirects', async () => {
    mockFetch.mockImplementation(async () => redirect('https://loop.example/favicon.ico'));
    await expect(NextJsFaviconService.fetch(new URL('https://loop.example/favicon.ico'))).resolves.toBeNull();
    expect(mockFetch).toHaveBeenCalledTimes(4);
  });

  it.each([
    ['an HTML page', '<!DOCTYPE html><html></html>', 'text/html'],
    ['an HTML page labelled as an icon', '<!DOCTYPE html><html></html>', 'image/x-icon'],
    ['an SVG', '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>', 'image/svg+xml'],
    ['an SVG labelled as binary', '<svg xmlns="http://www.w3.org/2000/svg"/>', 'application/octet-stream'],
  ])('serves nothing for %s', async (_case, body, contentType) => {
    mockFetch.mockResolvedValueOnce(image(body, { 'content-type': contentType }));
    await expect(NextJsFaviconService.fetch(new URL('https://a.example/favicon.ico'))).resolves.toBeNull();
  });

  it('serves nothing for an error answer', async () => {
    mockFetch.mockResolvedValueOnce(new Response(PNG, { status: 404, headers: { 'content-type': 'image/png' } }));
    await expect(NextJsFaviconService.fetch(new URL('https://a.example/favicon.ico'))).resolves.toBeNull();
  });

  it('refuses an icon larger than the cap, declared or streamed', async () => {
    const large = new Uint8Array(FAVICON_MAX_BYTES + 1);
    large.set(PNG);
    mockFetch.mockResolvedValueOnce(
      image(PNG, { 'content-type': 'image/png', 'content-length': String(FAVICON_MAX_BYTES + 1) }),
    );
    await expect(NextJsFaviconService.fetch(new URL('https://a.example/favicon.ico'))).resolves.toBeNull();

    mockFetch.mockResolvedValueOnce(image(large));
    await expect(NextJsFaviconService.fetch(new URL('https://a.example/favicon.ico'))).resolves.toBeNull();
  });

  it('gives up when the site does not answer in time', async () => {
    vi.useFakeTimers();
    mockFetch.mockImplementation(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener('abort', () =>
            reject(Object.assign(new Error('aborted'), { name: 'AbortError' })),
          );
        }),
    );
    const pending = NextJsFaviconService.fetch(new URL('https://slow.example/favicon.ico'));
    await vi.advanceTimersByTimeAsync(5_000);
    await expect(pending).resolves.toBeNull();
  });

  it('turns a refused connection into no icon', async () => {
    mockFetch.mockRejectedValueOnce(new TypeError('fetch failed'));
    await expect(NextJsFaviconService.fetch(new URL('https://a.example/favicon.ico'))).resolves.toBeNull();
  });
});
