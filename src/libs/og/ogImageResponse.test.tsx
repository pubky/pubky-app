import { describe, expect, it, vi } from 'vitest';

// The real `ImageResponse` needs satori's wasm binaries, which do not load
// under vitest's transforms — and the contract under test is ours, not
// satori's: the body must be fully buffered before the response is returned,
// so a render-time failure rejects the promise (catchable by the OG renderers'
// try/catch) instead of erroring mid-stream after headers are sent.
const mockState = vi.hoisted(() => ({ build: (): Response => new Response() }));

vi.mock('next/og', () => ({
  ImageResponse: class {
    constructor() {
      return mockState.build();
    }
  },
}));
vi.mock('./ogFonts', () => ({ getOgFonts: () => [] }));

const { ogImageResponse } = await import('./ogImageResponse');

const PNG_SIGNATURE = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

describe('ogImageResponse', () => {
  it('resolves to a fully-buffered response preserving the rendered bytes and headers', async () => {
    mockState.build = () =>
      new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(PNG_SIGNATURE);
            controller.close();
          },
        }),
        { headers: { 'content-type': 'image/png', 'cache-control': 'public, max-age=3600' } },
      );

    const res = await ogImageResponse(<div />);

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('image/png');
    expect(res.headers.get('cache-control')).toContain('public');
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(PNG_SIGNATURE);
  });

  it('rejects catchably when the render stream fails (instead of 500ing mid-stream)', async () => {
    mockState.build = () =>
      new Response(
        new ReadableStream({
          pull(controller) {
            // Same shape as a satori render failure, e.g. an emoji SVG fetch
            // from the twemoji CDN rejecting during rendering.
            controller.error(new Error('satori render failed'));
          },
        }),
      );

    await expect(ogImageResponse(<div />)).rejects.toThrow('satori render failed');
  });
});
