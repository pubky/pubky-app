import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ShopMetadataService } from './shop-metadata';

const route = {
  hostPath: '/shop/marketplace/listing/seller/listing',
  embedPath: '/shop-embed/marketplace/listing/seller/listing',
};
const html = '<meta property="og:title" content="Listing" />';

describe('ShopMetadataService', () => {
  beforeEach(() => {
    vi.spyOn(globalThis, 'fetch');
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('bounds a stalled fetch even if the transport ignores abort', async () => {
    vi.useFakeTimers();
    vi.mocked(fetch).mockImplementation(() => new Promise(() => {}));

    const result = ShopMetadataService.fetch(route);
    await vi.advanceTimersByTimeAsync(6000);

    await expect(result).resolves.toBeNull();
    expect(vi.mocked(fetch).mock.calls[0][1]?.signal?.aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('keeps the deadline active while reading the body and cancels a stalled stream', async () => {
    vi.useFakeTimers();
    const cancel = vi.fn();
    vi.mocked(fetch).mockResolvedValue(
      new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode(html));
          },
          cancel,
        }),
        { headers: { 'content-type': 'text/html' } },
      ),
    );

    const result = ShopMetadataService.fetch(route);
    await vi.advanceTimersByTimeAsync(6000);

    await expect(result).resolves.toBeNull();
    expect(cancel).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('limits streamed bytes even when Content-Length claims a small body', async () => {
    const cancel = vi.fn();
    vi.mocked(fetch).mockResolvedValue(
      new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(new Uint8Array(1024 * 1024 + 1));
          },
          cancel,
        }),
        { headers: { 'content-type': 'text/html', 'content-length': '1' } },
      ),
    );

    await expect(ShopMetadataService.fetch(route)).resolves.toBeNull();
    expect(cancel).toHaveBeenCalledOnce();
  });

  it.each([
    { status: 302, contentType: 'text/html' },
    { status: 403, contentType: 'text/html' },
    { status: 200, contentType: 'application/json' },
  ])('discards unexpected responses without reading their body: %j', async ({ status, contentType }) => {
    const cancel = vi.fn();
    vi.mocked(fetch).mockResolvedValue(
      new Response(new ReadableStream({ cancel }), {
        status,
        headers: { 'content-type': contentType, location: '/shop/marketplace/listing/seller/listing' },
      }),
    );

    await expect(ShopMetadataService.fetch(route)).resolves.toBeNull();
    expect(cancel).toHaveBeenCalledOnce();
    expect(fetch).toHaveBeenCalledOnce();
  });

  it('falls back if a body stream fails partway through', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(
        new ReadableStream({
          start(controller) {
            controller.error(new TypeError('Connection closed'));
          },
        }),
        { headers: { 'content-type': 'text/html' } },
      ),
    );

    await expect(ShopMetadataService.fetch(route)).resolves.toBeNull();
  });

  it('clears the deadline after a successful complete response', async () => {
    vi.useFakeTimers();
    vi.mocked(fetch).mockResolvedValue(new Response(html, { headers: { 'content-type': 'text/html' } }));

    await expect(ShopMetadataService.fetch(route)).resolves.toEqual({ title: 'Listing', description: '', image: null });
    expect(vi.getTimerCount()).toBe(0);
  });
});
