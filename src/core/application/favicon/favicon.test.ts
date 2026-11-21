import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FAVICON_CACHE_BYTES, FAVICON_CACHE_ENTRIES, FaviconApplication } from './favicon';

const { mockServiceFetch } = vi.hoisted(() => ({ mockServiceFetch: vi.fn() }));

vi.mock('@/services/nextjs/favicon/favicon', () => ({
  NextJsFaviconService: { fetch: mockServiceFetch },
}));

const ICON = { body: new Uint8Array([1, 2, 3]).buffer, contentType: 'image/png' };
/** `FAVICON_MAX_BYTES`: the largest icon the service serves. */
const LARGEST_ICON = 256 * 1024;
const largestIcon = () => ({ body: new ArrayBuffer(LARGEST_ICON), contentType: 'image/x-icon' });

beforeEach(() => {
  FaviconApplication.clearCache();
  mockServiceFetch.mockReset();
});

afterEach(() => vi.useRealTimers());

describe('FaviconApplication.fetch', () => {
  it('reads the address the host’s icon is at', async () => {
    mockServiceFetch.mockResolvedValue(ICON);
    await FaviconApplication.fetch('open.spotify.com');
    await FaviconApplication.fetch('tycho.bandcamp.com');
    expect(mockServiceFetch.mock.calls.map(([url]) => String(url))).toEqual([
      'https://open.spotify.com/favicon.ico',
      'https://s4.bcbits.com/img/favicon/favicon-32x32.png',
    ]);
  });

  it('asks a site once a day for its icon, and once an hour when it had none', async () => {
    vi.useFakeTimers();
    mockServiceFetch.mockResolvedValueOnce(ICON).mockResolvedValueOnce(null);

    await expect(FaviconApplication.fetch('a.example')).resolves.toBe(ICON);
    await expect(FaviconApplication.fetch('b.example')).resolves.toBeNull();
    await FaviconApplication.fetch('a.example');
    await FaviconApplication.fetch('b.example');
    expect(mockServiceFetch).toHaveBeenCalledTimes(2);

    mockServiceFetch.mockResolvedValue(ICON);
    vi.advanceTimersByTime(60 * 60 * 1000 + 1);
    await FaviconApplication.fetch('a.example');
    await expect(FaviconApplication.fetch('b.example')).resolves.toBe(ICON);
    expect(mockServiceFetch).toHaveBeenCalledTimes(3);

    vi.advanceTimersByTime(24 * 60 * 60 * 1000);
    await FaviconApplication.fetch('a.example');
    expect(mockServiceFetch).toHaveBeenCalledTimes(4);
  });

  it('keeps one entry for every subdomain of a site whose icon is listed', async () => {
    mockServiceFetch.mockResolvedValue(ICON);
    await FaviconApplication.fetch('a1.bandcamp.com');
    await FaviconApplication.fetch('a2.bandcamp.com');
    await FaviconApplication.fetch('bandcamp.com');
    expect(mockServiceFetch).toHaveBeenCalledTimes(1);
  });

  it('shares one read between concurrent requests for a host', async () => {
    let resolve: (value: typeof ICON) => void = () => {};
    mockServiceFetch.mockReturnValueOnce(new Promise((done) => (resolve = done)));
    const first = FaviconApplication.fetch('a.example');
    const second = FaviconApplication.fetch('a.example');
    resolve(ICON);
    await expect(Promise.all([first, second])).resolves.toEqual([ICON, ICON]);
    expect(mockServiceFetch).toHaveBeenCalledTimes(1);
  });

  it('keeps at most 256 hosts, letting the least recently used go first', async () => {
    mockServiceFetch.mockResolvedValue(ICON);
    for (let index = 0; index < 256; index++) await FaviconApplication.fetch(`h${index}.example`);
    await FaviconApplication.fetch('h0.example');
    await FaviconApplication.fetch('h256.example');
    expect(mockServiceFetch).toHaveBeenCalledTimes(257);

    await FaviconApplication.fetch('h0.example');
    expect(mockServiceFetch).toHaveBeenCalledTimes(257);
    await FaviconApplication.fetch('h1.example');
    expect(mockServiceFetch).toHaveBeenCalledTimes(258);
  });

  it('keeps the icons’ bytes within the budget, letting the least recently used go first', async () => {
    const fit = FAVICON_CACHE_BYTES / LARGEST_ICON;
    expect(fit).toBeLessThan(FAVICON_CACHE_ENTRIES);
    mockServiceFetch.mockImplementation(async () => largestIcon());
    for (let index = 0; index < fit; index++) await FaviconApplication.fetch(`h${index}.example`);
    await FaviconApplication.fetch('h0.example');
    expect(mockServiceFetch).toHaveBeenCalledTimes(fit);

    // One more of the largest icons: the least recently used one (h1) goes, h0 stays.
    await FaviconApplication.fetch(`h${fit}.example`);
    await FaviconApplication.fetch('h0.example');
    expect(mockServiceFetch).toHaveBeenCalledTimes(fit + 1);
    await FaviconApplication.fetch('h1.example');
    expect(mockServiceFetch).toHaveBeenCalledTimes(fit + 2);
  });

  it('counts a replaced or expired icon’s bytes once', async () => {
    vi.useFakeTimers();
    const fit = FAVICON_CACHE_BYTES / LARGEST_ICON;
    mockServiceFetch.mockImplementation(async () => largestIcon());
    // The same host read again after its day: still one icon's bytes, not two.
    for (let round = 0; round < 3; round++) {
      await FaviconApplication.fetch('again.example');
      vi.advanceTimersByTime(24 * 60 * 60 * 1000 + 1);
    }
    expect(mockServiceFetch).toHaveBeenCalledTimes(3);
    // Room is left for `fit` more icons, all kept.
    for (let index = 0; index < fit; index++) await FaviconApplication.fetch(`h${index}.example`);
    for (let index = 0; index < fit; index++) await FaviconApplication.fetch(`h${index}.example`);
    expect(mockServiceFetch).toHaveBeenCalledTimes(3 + fit);
  });
});
