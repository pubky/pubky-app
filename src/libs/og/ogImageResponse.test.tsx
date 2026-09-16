import { afterEach, describe, expect, it, vi } from 'vitest';
import { OG_CACHE_HEADERS, OG_SIZE } from './ogConstants';
import type { getOgFonts } from './ogFonts';
import { ogImageResponse } from './ogImageResponse';

// The real `ImageResponse` needs satori's wasm binaries, which do not load
// under vitest's transforms — and the contract under test is ours, not
// satori's: the constructor must receive the shared OG configuration, and the
// body must be fully buffered before the response is returned so a render-time
// failure rejects the promise (catchable by the OG renderers' try/catch)
// instead of erroring mid-stream. The mock applies the received headers like
// the real ImageResponse does, so the header assertions read the factory's
// configuration, not mock literals.
const mockState = vi.hoisted(() => ({
  buildBody: (): BodyInit | null => null,
  lastOptions: null as { width?: number; height?: number; fonts?: unknown; headers?: Record<string, string> } | null,
}));

vi.mock('next/og', () => ({
  ImageResponse: class {
    constructor(_element: unknown, options: NonNullable<typeof mockState.lastOptions>) {
      mockState.lastOptions = options;
      return new Response(mockState.buildBody(), {
        headers: { 'content-type': 'image/png', ...options.headers },
      });
    }
  },
}));

const mockFonts = vi.hoisted(() => [] as ReturnType<typeof getOgFonts>);
vi.mock('./ogFonts', () => ({ getOgFonts: () => mockFonts }));

const PNG_SIGNATURE = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

describe('ogImageResponse', () => {
  afterEach(() => {
    mockState.buildBody = () => null;
    mockState.lastOptions = null;
  });

  it('configures the render with the shared size, fonts and cache headers, and buffers the bytes', async () => {
    mockState.buildBody = () =>
      new ReadableStream({
        start(controller) {
          controller.enqueue(PNG_SIGNATURE);
          controller.close();
        },
      });

    const res = await ogImageResponse(<div />);

    expect(mockState.lastOptions?.width).toBe(OG_SIZE.width);
    expect(mockState.lastOptions?.height).toBe(OG_SIZE.height);
    expect(mockState.lastOptions?.fonts).toBe(mockFonts);
    expect(mockState.lastOptions?.headers).toBe(OG_CACHE_HEADERS);

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('image/png');
    expect(res.headers.get('cache-control')).toBe(OG_CACHE_HEADERS['cache-control']);
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(PNG_SIGNATURE);
  });

  it('rejects catchably when the render stream fails (instead of erroring mid-stream)', async () => {
    mockState.buildBody = () =>
      new ReadableStream({
        pull(controller) {
          // Same shape as a satori render failure, e.g. an emoji SVG fetch
          // from the twemoji CDN rejecting during rendering.
          controller.error(new Error('satori render failed'));
        },
      });

    await expect(ogImageResponse(<div />)).rejects.toThrow('satori render failed');
  });
});
