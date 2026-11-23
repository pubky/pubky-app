import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GET } from './route';

const { fetchPost } = vi.hoisted(() => ({ fetchPost: vi.fn() }));
vi.mock('@/application/x-post/x-post', () => ({
  X_POST_BUSY: 'busy',
  X_POST_UNAVAILABLE: 'unavailable',
  XPostApplication: { fetchPost },
}));

const request = (query: string) => new NextRequest(`https://pubky.app/api/x-post${query}`);
const POST = {
  id: '20',
  text: 'hello',
  authorName: 'jack',
  handle: 'jack',
  published: null,
  image: null,
  images: [],
  hasVideo: false,
  video: null,
  videoAspect: null,
};

describe('GET /api/x-post', () => {
  beforeEach(() => fetchPost.mockReset());

  it('answers the post as the app’s own JSON, cached', async () => {
    fetchPost.mockResolvedValueOnce(POST);

    const response = await GET(request('?id=20'));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(POST);
    expect(fetchPost).toHaveBeenCalledWith('20');
    expect(response.headers.get('cache-control')).toContain('max-age=3600');
    expect(response.headers.get('cross-origin-resource-policy')).toBe('same-origin');
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
  });

  it.each(['', '?id=', '?id=abc', '?id=20%2F..', `?id=${'1'.repeat(21)}`, '?id=99999999999999999999', '?id=020'])(
    'refuses %j with a 400, reading nothing',
    async (query) => {
      const response = await GET(request(query));

      expect(response.status).toBe(400);
      expect(fetchPost).not.toHaveBeenCalled();
    },
  );

  it.each([
    [null, 404, 'public, max-age=300, s-maxage=300'],
    ['unavailable', 502, 'no-store'],
    ['busy', 503, 'no-store'],
  ])('answers %s as %i, with no body', async (answer, status, cache) => {
    fetchPost.mockResolvedValueOnce(answer);

    const response = await GET(request('?id=20'));

    expect(response.status).toBe(status);
    expect(response.headers.get('cache-control')).toBe(cache);
    await expect(response.text()).resolves.toBe('');
  });

  it('answers an empty 500 for anything unexpected', async () => {
    fetchPost.mockRejectedValueOnce(new Error('boom'));

    const response = await GET(request('?id=20'));

    expect(response.status).toBe(500);
    await expect(response.text()).resolves.toBe('');
  });
});
