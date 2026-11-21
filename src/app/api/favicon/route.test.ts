import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GET } from './route';

const { mockApplicationFetch } = vi.hoisted(() => ({ mockApplicationFetch: vi.fn() }));

vi.mock('@/application/favicon/favicon', () => ({
  FaviconApplication: { fetch: mockApplicationFetch },
}));

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const request = (query: string) => new NextRequest(`https://pubky.app/api/favicon${query}`);

beforeEach(() => mockApplicationFetch.mockReset());

describe('GET /api/favicon', () => {
  it('serves the icon from the app’s origin as an image only', async () => {
    mockApplicationFetch.mockResolvedValueOnce({ body: PNG.buffer, contentType: 'image/png' });

    const response = await GET(request('?host=Open.Spotify.com'));

    expect(response.status).toBe(200);
    expect(mockApplicationFetch).toHaveBeenCalledWith('open.spotify.com');
    expect(response.headers.get('content-type')).toBe('image/png');
    expect(response.headers.get('content-length')).toBe(String(PNG.byteLength));
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    expect(response.headers.get('content-security-policy')).toBe("default-src 'none'; sandbox");
    expect(response.headers.get('cross-origin-resource-policy')).toBe('same-origin');
    expect(response.headers.get('cache-control')).toBe(
      'public, max-age=86400, s-maxage=604800, stale-while-revalidate=86400',
    );
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(PNG);
  });

  it('answers 404, cached for an hour, when the site has no icon', async () => {
    mockApplicationFetch.mockResolvedValueOnce(null);
    const response = await GET(request('?host=a.example'));
    expect(response.status).toBe(404);
    expect(response.headers.get('cache-control')).toBe('public, max-age=3600, s-maxage=3600');
    expect(await response.text()).toBe('');
  });

  it.each(['', '?host=', '?host=127.0.0.1', '?host=localhost', '?host=a.example:8080', '?url=https://a.example/x.png'])(
    'refuses %s without reading anything',
    async (query) => {
      const response = await GET(request(query));
      expect(response.status).toBe(400);
      expect(response.headers.get('x-content-type-options')).toBe('nosniff');
      expect(mockApplicationFetch).not.toHaveBeenCalled();
    },
  );
});
