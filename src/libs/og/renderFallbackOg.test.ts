import sharp from 'sharp';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { OG_FALLBACK_CACHE_HEADERS, OG_SIZE } from './ogConstants';
import { renderFallbackOg } from './renderFallbackOg';

const configState = vi.hoisted(() => ({ previewImage: '/preview.webp', throwOnConfigRead: false }));

vi.mock('@/config/metadata', () => ({
  getDefaultUrl: () => 'https://example.com',
  getPreviewImage: () => {
    if (configState.throwOnConfigRead) throw new Error('runtime config unavailable');
    return configState.previewImage;
  },
}));

const FALLBACK_CACHE_CONTROL = OG_FALLBACK_CACHE_HEADERS['cache-control'];

async function expectNormalizedPng(res: Response) {
  expect(res.status).toBe(200);
  expect(res.headers.get('content-type')).toBe('image/png');
  expect(res.headers.get('cache-control')).toBe(FALLBACK_CACHE_CONTROL);

  const meta = await sharp(Buffer.from(await res.arrayBuffer())).metadata();
  expect(meta.format).toBe('png');
  expect(meta.width).toBe(OG_SIZE.width);
  expect(meta.height).toBe(OG_SIZE.height);
}

describe('renderFallbackOg', () => {
  afterEach(() => {
    configState.previewImage = '/preview.webp';
    configState.throwOnConfigRead = false;
    vi.unstubAllGlobals();
  });

  it('serves the public preview asset as a normalized OG-size PNG (crawlers do not follow redirects for card images)', async () => {
    await expectNormalizedPng(await renderFallbackOg());
  });

  it('serves the bytes for a query-stringed (cache-busted) preview path', async () => {
    configState.previewImage = '/preview.webp?v=2';
    await expectNormalizedPng(await renderFallbackOg());
  });

  it('proxies an absolute preview URL through as a normalized PNG', async () => {
    configState.previewImage = 'https://cdn.example.com/remote-ok.png';
    const remote = await sharp({ create: { width: 4, height: 4, channels: 3, background: { r: 0, g: 120, b: 0 } } })
      .png()
      .toBuffer();
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () => new Response(new Uint8Array(remote), { status: 200, headers: { 'Content-Type': 'image/png' } }),
      ),
    );

    await expectNormalizedPng(await renderFallbackOg());
  });

  it('degrades to the bundled public asset when the configured absolute preview URL fails', async () => {
    configState.previewImage = 'https://cdn.example.com/remote-missing.png';
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('nope', { status: 404 })),
    );

    await expectNormalizedPng(await renderFallbackOg());
  });

  it('degrades to a 307 (absolute Location, short cache) only when no bytes can be produced at all', async () => {
    configState.previewImage = '/does-not-exist.webp';

    const res = await renderFallbackOg();

    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toBe('https://example.com/does-not-exist.webp');
    expect(res.headers.get('cache-control')).toBe(FALLBACK_CACHE_CONTROL);
  });

  it('rejects a preview path escaping public/ and degrades to the redirect', async () => {
    configState.previewImage = '/../package.json';

    const res = await renderFallbackOg();

    expect(res.status).toBe(307);
  });

  it('never rejects — even when reading the runtime config itself throws', async () => {
    configState.throwOnConfigRead = true;

    const res = await renderFallbackOg();

    expect(res.status).toBe(307);
    // With no usable config, the redirect aims at the default preview path.
    expect(res.headers.get('location')).toBe('https://example.com/preview.webp');
  });
});
