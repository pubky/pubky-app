import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

const configState = vi.hoisted(() => ({ previewImage: '/preview.webp' }));

vi.mock('@/config/metadata', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/config/metadata')>();
  return {
    ...actual,
    getDefaultUrl: () => 'https://example.com',
    getPreviewImage: () => configState.previewImage,
  };
});

const { renderFallbackOg } = await import('./renderFallbackOg');

describe('renderFallbackOg', () => {
  afterEach(() => {
    configState.previewImage = '/preview.webp';
    vi.unstubAllGlobals();
  });

  it('serves the public preview asset as direct image bytes (crawlers do not follow redirects for card images)', async () => {
    const res = await renderFallbackOg();

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('image/webp');
    expect(res.headers.get('cache-control')).toContain('public');

    const expected = await readFile(path.join(process.cwd(), 'public', 'preview.webp'));
    expect(Buffer.from(await res.arrayBuffer())).toEqual(expected);
  });

  it('proxies an absolute preview URL through as image bytes', async () => {
    configState.previewImage = 'https://cdn.example.com/preview.png';
    const bytes = new Uint8Array([1, 2, 3, 4]);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(bytes, { status: 200, headers: { 'Content-Type': 'image/png' } })),
    );

    const res = await renderFallbackOg();

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('image/png');
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(bytes);
  });

  it('degrades to a 307 redirect (absolute Location) when the preview bytes cannot be produced', async () => {
    configState.previewImage = '/does-not-exist.webp';

    const res = await renderFallbackOg();

    expect(res.status).toBe(307);
    const location = res.headers.get('location');
    expect(location).toBe('https://example.com/does-not-exist.webp');
  });

  it('degrades to a 307 redirect when an absolute preview URL does not return an image', async () => {
    configState.previewImage = 'https://cdn.example.com/preview.png';
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('nope', { status: 404 })),
    );

    const res = await renderFallbackOg();

    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toBe('https://cdn.example.com/preview.png');
  });
});
