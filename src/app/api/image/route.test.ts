import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { IMAGE_BUSY, IMAGE_UNAVAILABLE } from '@/application/image/image.types';
import { GET } from './route';

const { mockApplicationFetch, mockLinkFetch, mockYouTubeFetch, mockPostImageFetch, mockCarriesImage } = vi.hoisted(
  () => ({
    mockApplicationFetch: vi.fn(),
    mockLinkFetch: vi.fn(),
    mockYouTubeFetch: vi.fn(),
    mockPostImageFetch: vi.fn(),
    mockCarriesImage: vi.fn(),
  }),
);

vi.mock('@/application/image/image', () => ({
  ImageApplication: {
    fetchCardImage: mockApplicationFetch,
    fetchLinkImage: mockLinkFetch,
    fetchYouTubeThumbnail: mockYouTubeFetch,
    fetchPostImage: mockPostImageFetch,
  },
}));
vi.mock('@/application/x-post/x-post', () => ({
  X_POST_BUSY: 'busy',
  X_POST_UNAVAILABLE: 'unavailable',
  XPostApplication: { carriesImage: mockCarriesImage },
}));

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0]);
const URI = 'https://open.spotify.com/album/1';
const SRC = 'https://i.scdn.co/image/cover';
const request = (query: string) => new NextRequest(`https://pubky.app/api/image${query}`);
const valid = `?${new URLSearchParams({ uri: URI, src: SRC })}`;

const expectSafeHeaders = (response: Response) => {
  expect(response.headers.get('x-content-type-options')).toBe('nosniff');
  expect(response.headers.get('content-security-policy')).toBe("default-src 'none'; sandbox");
  expect(response.headers.get('cross-origin-resource-policy')).toBe('same-origin');
};

beforeEach(() => {
  mockApplicationFetch.mockReset();
  mockLinkFetch.mockReset();
  mockYouTubeFetch.mockReset();
  mockPostImageFetch.mockReset();
  mockCarriesImage.mockReset();
});

describe('GET /api/image?xpost=', () => {
  const POST_SRC = 'https://pbs.twimg.com/media/photo.jpg';
  const post = (id: string, src = POST_SRC) => request(`?${new URLSearchParams({ xpost: id, src })}`);

  it('serves an image the post the server read carries, as an image only', async () => {
    mockCarriesImage.mockResolvedValueOnce(true);
    mockPostImageFetch.mockResolvedValueOnce({ body: JPEG.buffer, contentType: 'image/jpeg' });

    const response = await GET(post('123'));

    expect(response.status).toBe(200);
    expect(mockCarriesImage).toHaveBeenCalledWith('123', POST_SRC);
    expect(mockPostImageFetch).toHaveBeenCalledWith(POST_SRC);
    expectSafeHeaders(response);
  });

  it('refuses an image the post does not carry, reading nothing', async () => {
    mockCarriesImage.mockResolvedValueOnce(false);

    const response = await GET(post('123', 'https://pbs.twimg.com/media/other.jpg'));

    expect(response.status).toBe(404);
    expect(mockPostImageFetch).not.toHaveBeenCalled();
  });

  it.each(['abc', '12a', '1'.repeat(21), ''])('refuses the post ID %j without a read', async (id) => {
    const response = await GET(post(id));

    expect(response.status).toBe(400);
    expect(mockCarriesImage).not.toHaveBeenCalled();
  });

  it('refuses a post with a second mode', async () => {
    const response = await GET(request(`?${new URLSearchParams({ xpost: '1', uri: URI, src: POST_SRC })}`));

    expect(response.status).toBe(400);
  });

  it.each([
    ['busy', 503],
    ['unavailable', 502],
  ])('answers %s as %i, never cached', async (answer, status) => {
    mockCarriesImage.mockResolvedValueOnce(answer);

    const response = await GET(post('123'));

    expect(response.status).toBe(status);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(mockPostImageFetch).not.toHaveBeenCalled();
  });
});

describe('GET /api/image', () => {
  it('serves the card’s image from the app’s origin as an image only', async () => {
    mockApplicationFetch.mockResolvedValueOnce({ body: JPEG.buffer, contentType: 'image/jpeg' });

    const response = await GET(request(valid));

    expect(response.status).toBe(200);
    expect(mockApplicationFetch).toHaveBeenCalledWith(URI, SRC, { episode: undefined, og: false });
    expect(response.headers.get('content-type')).toBe('image/jpeg');
    expect(response.headers.get('content-length')).toBe(String(JPEG.byteLength));
    expectSafeHeaders(response);
    expect(response.headers.get('cache-control')).toBe(
      'public, max-age=86400, s-maxage=86400, stale-while-revalidate=86400',
    );
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(JPEG);
  });

  it('names an episode’s title to the card’s read', async () => {
    mockApplicationFetch.mockResolvedValueOnce(null);
    await GET(request(`?${new URLSearchParams({ uri: URI, src: SRC, episode: ' 12: Old ' })}`));
    expect(mockApplicationFetch).toHaveBeenCalledWith(URI, SRC, { episode: '12: Old', og: false });
  });

  it('asks for a card’s own preview image with og=1', async () => {
    mockApplicationFetch.mockResolvedValueOnce(null);
    await GET(request(`?${new URLSearchParams({ uri: URI, og: '1', src: SRC })}`));
    expect(mockApplicationFetch).toHaveBeenCalledWith(URI, SRC, { episode: undefined, og: true });
  });

  it('serves a YouTube thumbnail by its video ID and a listed size', async () => {
    mockYouTubeFetch.mockResolvedValueOnce({ body: JPEG.buffer, contentType: 'image/jpeg' });
    const response = await GET(request('?youtube=dQw4w9WgXcQ&variant=mqdefault'));
    expect(response.status).toBe(200);
    expect(mockYouTubeFetch).toHaveBeenCalledWith({ id: 'dQw4w9WgXcQ', variant: 'mqdefault' });
  });

  it('serves a link preview’s image by its link', async () => {
    mockLinkFetch.mockResolvedValueOnce({ body: JPEG.buffer, contentType: 'image/jpeg' });
    const response = await GET(request(`?${new URLSearchParams({ link: 'https://www.example.com/a', src: SRC })}`));
    expect(response.status).toBe(200);
    expect(String(mockLinkFetch.mock.calls[0][0])).toBe('https://www.example.com/a');
    expect(mockLinkFetch.mock.calls[0][1]).toBe(SRC);
    expect(mockApplicationFetch).not.toHaveBeenCalled();
  });

  it('answers 404, cached for five minutes, when the card does not carry the image', async () => {
    mockApplicationFetch.mockResolvedValueOnce(null);
    const response = await GET(request(valid));
    expect(response.status).toBe(404);
    expect(response.headers.get('cache-control')).toBe('public, max-age=300, s-maxage=300');
    expectSafeHeaders(response);
    expect(await response.text()).toBe('');
  });

  it.each([
    [IMAGE_UNAVAILABLE, 502],
    [IMAGE_BUSY, 503],
  ])('answers %s with %i, never cached and without a detail', async (answer, status) => {
    mockApplicationFetch.mockResolvedValueOnce(answer);
    const response = await GET(request(valid));
    expect(response.status).toBe(status);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expectSafeHeaders(response);
    expect(await response.text()).toBe('');
  });

  it('answers an unexpected failure with an empty 500, the image headers and no-store', async () => {
    mockApplicationFetch.mockRejectedValueOnce(new TypeError('unexpected'));
    const response = await GET(request(valid));
    expect(response.status).toBe(500);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expectSafeHeaders(response);
    expect(await response.text()).toBe('');
  });

  it.each([
    ['no parameters', ''],
    ['an image alone', `?${new URLSearchParams({ src: SRC })}`],
    ['a resource alone', `?${new URLSearchParams({ uri: URI })}`],
    ['a private address on another port', `?${new URLSearchParams({ uri: URI, src: 'http://10.0.0.5:8080/x' })}`],
    ['a file', `?${new URLSearchParams({ uri: URI, src: 'file:///etc/passwd' })}`],
    ['credentials', `?${new URLSearchParams({ uri: URI, src: 'https://u:p@i.scdn.co/x' })}`],
    ['a resource with credentials', `?${new URLSearchParams({ uri: 'https://u:p@a.example/', src: SRC })}`],
    ['a url parameter', `?${new URLSearchParams({ url: SRC })}`],
    ['both a resource and a link', `?${new URLSearchParams({ uri: URI, link: URI, src: SRC })}`],
    ['a link that is no web link', `?${new URLSearchParams({ link: 'file:///etc/passwd', src: SRC })}`],
    ['an empty episode', `?${new URLSearchParams({ uri: URI, src: SRC, episode: ' ' })}`],
    ['another og value', `?${new URLSearchParams({ uri: URI, src: SRC, og: 'yes' })}`],
    ['a YouTube ID that is no ID', '?youtube=../../evil&variant=hq720'],
    ['an unlisted YouTube size', '?youtube=dQw4w9WgXcQ&variant=maxresdefault'],
    [
      'a YouTube thumbnail with an address',
      `?${new URLSearchParams({ youtube: 'dQw4w9WgXcQ', variant: 'hq720', src: SRC })}`,
    ],
    [
      'a YouTube thumbnail and a card',
      `?${new URLSearchParams({ youtube: 'dQw4w9WgXcQ', variant: 'hq720', uri: URI })}`,
    ],
  ])('refuses %s without reading anything', async (_case, query) => {
    const response = await GET(request(query));
    expect(response.status).toBe(400);
    expect(response.headers.get('cache-control')).toBe('public, max-age=86400, s-maxage=86400');
    expectSafeHeaders(response);
    expect(mockApplicationFetch).not.toHaveBeenCalled();
    expect(mockLinkFetch).not.toHaveBeenCalled();
    expect(mockYouTubeFetch).not.toHaveBeenCalled();
  });
});
