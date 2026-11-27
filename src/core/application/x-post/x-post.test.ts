import type { Tweet } from 'react-tweet/api';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextJsXPostService, X_POST_FAILED } from '@/services/nextjs/x-post/x-post';
import { asOpaque } from '@/test-utils/type-assertions';
import { X_POST_BURST, X_POST_BUSY, X_POST_PAUSE_MS, X_POST_UNAVAILABLE, XPostApplication } from './x-post';

vi.mock('@/services/nextjs/x-post/x-post', () => ({
  X_POST_FAILED: 'failed',
  NextJsXPostService: { fetch: vi.fn() },
}));

const PHOTO = 'https://pbs.twimg.com/media/a.jpg';
const tweet = (id = '20') =>
  asOpaque<Tweet>({
    id_str: id,
    text: 'hello',
    display_text_range: [0, 5],
    created_at: '2006-03-21T20:50:14.000Z',
    user: { name: 'jack', screen_name: 'jack' },
    photos: [{ url: PHOTO }],
  });

describe('XPostApplication', () => {
  beforeEach(() => {
    XPostApplication.clearCache();
    vi.mocked(NextJsXPostService.fetch).mockReset();
  });
  afterEach(() => vi.useRealTimers());

  it('reads a post once and keeps only what the app shows', async () => {
    vi.mocked(NextJsXPostService.fetch).mockResolvedValue(tweet());

    const [first, second] = await Promise.all([XPostApplication.fetchPost('20'), XPostApplication.fetchPost('20')]);
    await XPostApplication.fetchPost('20');

    expect(first).toEqual(second);
    expect(first).toMatchObject({ id: '20', text: 'hello', images: [PHOTO] });
    expect(NextJsXPostService.fetch).toHaveBeenCalledTimes(1);
  });

  it('takes X’s answer for another post as none', async () => {
    vi.mocked(NextJsXPostService.fetch).mockResolvedValue(tweet('40'));

    await expect(XPostApplication.fetchPost('41')).resolves.toBeNull();
  });

  it('remembers that X has no such post', async () => {
    vi.mocked(NextJsXPostService.fetch).mockResolvedValue(null);

    await expect(XPostApplication.fetchPost('21')).resolves.toBeNull();
    await expect(XPostApplication.fetchPost('21')).resolves.toBeNull();
    expect(NextJsXPostService.fetch).toHaveBeenCalledTimes(1);
  });

  it('answers unavailable when X fails, remembers nothing and asks X nothing for a while', async () => {
    vi.useFakeTimers();
    vi.mocked(NextJsXPostService.fetch).mockResolvedValueOnce(X_POST_FAILED).mockResolvedValue(tweet('22'));

    await expect(XPostApplication.fetchPost('22')).resolves.toBe(X_POST_UNAVAILABLE);
    await expect(XPostApplication.fetchPost('22')).resolves.toBe(X_POST_BUSY);
    expect(NextJsXPostService.fetch).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(X_POST_PAUSE_MS);
    await expect(XPostApplication.fetchPost('22')).resolves.toMatchObject({ id: '22' });
  });

  it('answers busy past its budget, without asking X', async () => {
    vi.mocked(NextJsXPostService.fetch).mockImplementation(async (id) => tweet(id));
    for (let index = 0; index < X_POST_BURST; index++) await XPostApplication.fetchPost(String(100 + index));

    await expect(XPostApplication.fetchPost('999')).resolves.toBe(X_POST_BUSY);
    expect(NextJsXPostService.fetch).toHaveBeenCalledTimes(X_POST_BURST);
  });

  it('tells whether the post carries an image, by its exact address', async () => {
    vi.mocked(NextJsXPostService.fetch).mockResolvedValue(tweet());

    await expect(XPostApplication.carriesImage('20', PHOTO)).resolves.toBe(true);
    await expect(XPostApplication.carriesImage('20', 'https://pbs.twimg.com/media/other.jpg')).resolves.toBe(false);
  });

  it('carries no image for a post X has none of, and passes busy on', async () => {
    vi.mocked(NextJsXPostService.fetch).mockResolvedValueOnce(null).mockResolvedValueOnce(X_POST_FAILED);

    await expect(XPostApplication.carriesImage('30', PHOTO)).resolves.toBe(false);
    await expect(XPostApplication.carriesImage('31', PHOTO)).resolves.toBe(X_POST_UNAVAILABLE);
  });
});
