import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { type GUARDED_IMAGE_BUSY, GUARDED_IMAGE_FAILED, type TGuardedImage } from '../nextjs.image';
import { IMAGE_MAX_BYTES, IMAGE_TIMEOUT_MS, NextJsImageService } from './image';

const { mockCheckDnsSafety } = vi.hoisted(() => ({
  mockCheckDnsSafety: vi.fn<(hostname: string) => Promise<{ ok: boolean; reason?: string }>>(),
}));

vi.mock('../nextjs.utils', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../nextjs.utils')>();
  return { ...actual, checkDnsSafety: mockCheckDnsSafety };
});

// The link preview's guarded dispatcher is a real socket agent; the tests stub `fetch` itself.
vi.mock('../og-metadata/og-metadata', () => ({ SAFE_OG_METADATA_DISPATCHER: { guarded: true } }));

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00]);
const ICO = new Uint8Array([0x00, 0x00, 0x01, 0x00, 0x05, 0x00]);
const PRIVATE_HOSTS = new Set(['internal.example', 'internal.cdn.example', '10.0.0.5', '169.254.169.254']);

const mockFetch = vi.fn<(url: URL, init: RequestInit & { dispatcher?: unknown }) => Promise<Response>>();

const image = (body: BodyInit, headers: Record<string, string> = { 'content-type': 'image/jpeg' }) =>
  new Response(body, { status: 200, headers });
const redirect = (location: string) => new Response(null, { status: 302, headers: { location } });
const read = (src: string) => NextJsImageService.fetch(new URL(src));
/** The image read, when there was one. */
const served = (result: TGuardedImage | null | typeof GUARDED_IMAGE_FAILED | typeof GUARDED_IMAGE_BUSY) =>
  typeof result === 'string' ? null : result;

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

describe('NextJsImageService.fetch', () => {
  it('serves a cover as the type its bytes are, through the guarded dispatcher, sending nothing of the viewer', async () => {
    mockFetch.mockResolvedValueOnce(image(JPEG, { 'content-type': 'application/octet-stream' }));

    const cover = served(await read('https://i.scdn.co/image/ab67616d'));

    expect(cover?.contentType).toBe('image/jpeg');
    expect(new Uint8Array(cover!.body)).toEqual(JPEG);
    const [url, init] = mockFetch.mock.calls[0];
    expect(String(url)).toBe('https://i.scdn.co/image/ab67616d');
    expect(init.dispatcher).toEqual({ guarded: true });
    expect(init.redirect).toBe('manual');
    expect(init.credentials).toBe('omit');
    expect(init.referrerPolicy).toBe('no-referrer');
    const headers = new Headers(init.headers);
    expect([...headers.keys()].sort()).toEqual(['accept', 'user-agent']);
    expect(headers.get('user-agent')).toBe('Mozilla/5.0');
  });

  it('follows the Cover Art Archive’s redirects to another site, checking every hop', async () => {
    mockFetch
      .mockResolvedValueOnce(redirect('https://archive.org/download/mbid-1/mbid-1-2_thumb500.jpg'))
      .mockResolvedValueOnce(redirect('https://ia800907.us.archive.org/15/items/mbid-1/mbid-1-2_thumb500.jpg'))
      .mockResolvedValueOnce(image(JPEG));

    const cover = served(await read('https://coverartarchive.org/release/1/front-500'));

    expect(cover?.contentType).toBe('image/jpeg');
    expect(mockCheckDnsSafety.mock.calls.map(([host]) => host)).toEqual([
      'coverartarchive.org',
      'archive.org',
      'ia800907.us.archive.org',
    ]);
  });

  it('never asks a host whose addresses are private', async () => {
    await expect(read('https://internal.example/x.jpg')).resolves.toBeNull();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('stops at a redirect hop to a private address', async () => {
    mockFetch.mockResolvedValueOnce(redirect('https://internal.cdn.example/latest/meta-data'));

    await expect(read('https://cdn.example/x.jpg')).resolves.toBeNull();
    expect(mockCheckDnsSafety).toHaveBeenCalledWith('internal.cdn.example');
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['an IP address', 'https://169.254.169.254/latest/meta-data'],
    ['another port', 'https://cdn.example:8443/x.jpg'],
    ['credentials', 'https://user:pass@cdn.example/x.jpg'],
    ['a non-web scheme', 'file:///etc/passwd'],
    ['a data URL', 'data:image/png;base64,AAAA'],
    ['plain http, down from https', 'http://cdn.example/x.jpg'],
  ])('follows no redirect to %s', async (_case, location) => {
    mockFetch.mockResolvedValueOnce(redirect(location));
    await expect(read('https://a.example/x.jpg')).resolves.toBeNull();
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('reads an http image a card carries', async () => {
    mockFetch.mockResolvedValueOnce(image(PNG, { 'content-type': 'image/png' }));
    await expect(read('http://www.dancarlin.com/graphics/x.png')).resolves.toMatchObject({ contentType: 'image/png' });
  });

  it('gives up after three redirects', async () => {
    mockFetch.mockImplementation(async () => redirect('https://loop.example/x.jpg'));
    await expect(read('https://loop.example/x.jpg')).resolves.toBeNull();
    expect(mockFetch).toHaveBeenCalledTimes(4);
  });

  it.each([
    ['an HTML page', '<!DOCTYPE html><html></html>', 'text/html'],
    ['an HTML page labelled as an image', '<!DOCTYPE html><html></html>', 'image/jpeg'],
    ['an SVG', '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>', 'image/svg+xml'],
    ['an SVG labelled as binary', '<svg xmlns="http://www.w3.org/2000/svg"/>', 'application/octet-stream'],
    ['an ICO', ICO, 'image/x-icon'],
  ])('serves nothing for %s', async (_case, body, contentType) => {
    mockFetch.mockResolvedValueOnce(image(body, { 'content-type': contentType }));
    await expect(read('https://a.example/x.jpg')).resolves.toBeNull();
  });

  it('serves nothing for a client error answer', async () => {
    mockFetch.mockResolvedValueOnce(new Response(JPEG, { status: 404, headers: { 'content-type': 'image/jpeg' } }));
    await expect(read('https://a.example/x.jpg')).resolves.toBeNull();
  });

  it.each([500, 503, 429])('answers failed, not "no image", for a %i', async (status) => {
    mockFetch.mockResolvedValueOnce(new Response(JPEG, { status, headers: { 'content-type': 'image/jpeg' } }));
    await expect(read('https://a.example/x.jpg')).resolves.toBe(GUARDED_IMAGE_FAILED);
  });

  it('serves nothing for a redirect to an address that does not parse', async () => {
    mockFetch.mockResolvedValueOnce(redirect('https://['));
    await expect(read('https://a.example/x.jpg')).resolves.toBeNull();
  });

  it('serves a cover as large as the cap, declared and streamed', async () => {
    const large = new Uint8Array(IMAGE_MAX_BYTES);
    large.set(JPEG);
    mockFetch.mockResolvedValueOnce(
      image(large, { 'content-type': 'image/jpeg', 'content-length': String(large.length) }),
    );
    await expect(read('https://a.example/x.jpg')).resolves.toMatchObject({ contentType: 'image/jpeg' });
  });

  it('refuses an image larger than the cap, declared or streamed', async () => {
    const large = new Uint8Array(IMAGE_MAX_BYTES + 1);
    large.set(JPEG);
    mockFetch.mockResolvedValueOnce(
      image(JPEG, { 'content-type': 'image/jpeg', 'content-length': String(IMAGE_MAX_BYTES + 1) }),
    );
    await expect(read('https://a.example/x.jpg')).resolves.toBeNull();

    mockFetch.mockResolvedValueOnce(image(large));
    await expect(read('https://a.example/x.jpg')).resolves.toBeNull();
  });

  it('gives up when the host does not answer in time', async () => {
    vi.useFakeTimers();
    mockFetch.mockImplementation(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener('abort', () =>
            reject(Object.assign(new Error('aborted'), { name: 'AbortError' })),
          );
        }),
    );
    const pending = read('https://slow.example/x.jpg');
    await vi.advanceTimersByTimeAsync(IMAGE_TIMEOUT_MS);
    await expect(pending).resolves.toBe(GUARDED_IMAGE_FAILED);
  });

  it('answers failed for a refused connection', async () => {
    mockFetch.mockRejectedValueOnce(new TypeError('fetch failed'));
    await expect(read('https://a.example/x.jpg')).resolves.toBe(GUARDED_IMAGE_FAILED);
  });
});
