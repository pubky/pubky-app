import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { KeyedSlots } from '@/utils/keyed-slots';
import { fetchGuardedImage, GUARDED_IMAGE_BUSY, type TGuardedImageRead } from './nextjs.image';

// The real address checks (`checkDnsSafety`, `isIpSafe`) run: only the socket agent and `fetch` are stubbed.
vi.mock('./og-metadata/og-metadata', () => ({ SAFE_OG_METADATA_DISPATCHER: { guarded: true } }));

const mockFetch = vi.fn<(url: URL, init: RequestInit) => Promise<Response>>();
const read = (src: string, enterHop?: TGuardedImageRead['enterHop']) =>
  fetchGuardedImage(new URL(src), {
    enterHop,
    maxBytes: 1024,
    timeoutMs: 1_000,
    maxRedirects: 3,
    headers: {},
    allowsHop: () => true,
    types: ['image/png'],
    operation: 'test',
  });

beforeEach(() => {
  mockFetch.mockReset();
  vi.stubGlobal('fetch', mockFetch);
});
afterEach(() => vi.unstubAllGlobals());

describe('fetchGuardedImage, with the real address checks', () => {
  it.each([
    'http://127.0.0.1/x.png',
    'http://2130706433/x.png',
    'http://0x7f.0.0.1/x.png',
    'http://0177.0.0.1/x.png',
    'http://10.0.0.5/x.png',
    'http://169.254.169.254/latest/meta-data',
    'http://100.64.0.1/x.png',
    'http://[::1]/x.png',
    'http://[::ffff:127.0.0.1]/x.png',
    'http://[fd00::1]/x.png',
    'http://[fe80::1]/x.png',
    'http://0.0.0.0/x.png',
  ])('never asks %s', async (src) => {
    await expect(read(src)).resolves.toBeNull();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('asks a slot for every hop, holds them for the read and gives them back, or is busy without one', async () => {
    const entered: string[] = [];
    const released: string[] = [];
    mockFetch
      .mockResolvedValueOnce(new Response(null, { status: 302, headers: { location: 'http://8.8.4.4/y.png' } }))
      .mockResolvedValueOnce(
        new Response(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), {
          headers: { 'content-type': 'image/png' },
        }),
      );
    const enterHop = async (url: URL) => {
      entered.push(url.hostname);
      return () => released.push(url.hostname);
    };
    await expect(read('http://8.8.8.8/x.png', enterHop)).resolves.toMatchObject({ contentType: 'image/png' });
    expect(entered).toEqual(['8.8.8.8', '8.8.4.4']);
    expect(released).toEqual(['8.8.8.8', '8.8.4.4']);

    mockFetch.mockReset();
    await expect(read('http://8.8.8.8/x.png', async () => null)).resolves.toBe(GUARDED_IMAGE_BUSY);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('leaves no slot behind when its read times out while waiting for its site', async () => {
    vi.useFakeTimers();
    const slots = new KeyedSlots(1);
    const holder = await slots.acquire('8.8.8.8', 0);
    const pending = fetchGuardedImage(new URL('http://8.8.8.8/x.png'), {
      maxBytes: 1024,
      timeoutMs: 1_000,
      maxRedirects: 3,
      headers: {},
      allowsHop: () => true,
      types: ['image/png'],
      operation: 'test',
      enterHop: (url, signal) => slots.acquire(url.hostname, 10_000, signal),
    });
    await vi.advanceTimersByTimeAsync(1_000);
    await expect(pending).resolves.not.toMatchObject({ contentType: expect.any(String) });

    holder?.();
    expect(slots.holders('8.8.8.8')).toBe(0);
    await expect(slots.acquire('8.8.8.8', 0)).resolves.not.toBeNull();
    expect(mockFetch).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it('never follows a redirect to an encoded private address', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(null, { status: 302, headers: { location: 'http://0x7f000001/x.png' } }),
    );
    await expect(read('http://8.8.8.8/x.png')).resolves.toBeNull();
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
});
