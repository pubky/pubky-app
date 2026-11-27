import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getXPostSource, NextJsXPostService, X_POST_FAILED, X_POST_MAX_BYTES } from './x-post';

const fetchMock = vi.fn();
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const TWEET = { __typename: 'Tweet', id_str: '20', text: 'just setting up my twttr' };

describe('NextJsXPostService.fetch', () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('reads the post from X’s syndication host as the app, with nothing of the viewer’s and no redirect', async () => {
    fetchMock.mockResolvedValueOnce(json(TWEET));

    await expect(NextJsXPostService.fetch('20')).resolves.toEqual(TWEET);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(getXPostSource('20'));
    expect(new URL(url).host).toBe('cdn.syndication.twimg.com');
    expect(new URL(url).searchParams.get('id')).toBe('20');
    expect(init).toMatchObject({ redirect: 'error', credentials: 'omit', referrerPolicy: 'no-referrer' });
    expect(init.headers['User-Agent']).toMatch(/^PubkyApp\/.+ \(\+https:\/\/pubky\.app\)$/);
    expect(Object.keys(init.headers)).toEqual(['User-Agent', 'Accept']);
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it.each([
    ['a 404', () => new Response(null, { status: 404 })],
    ['a 400 (an ID X refuses)', () => new Response(null, { status: 400 })],
    ['an empty answer', () => json({})],
    ['a tombstone', () => json({ __typename: 'TweetTombstone' })],
    ['an answer that is no post', () => json({ errors: [] })],
    ['another kind of answer', () => json({ __typename: 'TweetUnavailable' })],
  ])('answers no post for %s', async (_, answer) => {
    fetchMock.mockResolvedValueOnce(answer());

    await expect(NextJsXPostService.fetch('20')).resolves.toBeNull();
  });

  it.each([
    ['a 429', () => new Response(null, { status: 429 })],
    ['a 503', () => new Response(null, { status: 503 })],
    ['a 200 that is a page, not JSON', () => new Response('<html>challenge</html>', { status: 200 })],
    ['a 200 that is no JSON object', () => json(['not', 'a', 'post'])],
    ['an answer larger than the cap', () => new Response(new Uint8Array(X_POST_MAX_BYTES + 1))],
  ])('answers failed for %s, never throwing', async (_, answer) => {
    fetchMock.mockResolvedValueOnce(answer());

    await expect(NextJsXPostService.fetch('20')).resolves.toBe(X_POST_FAILED);
  });

  it('answers failed when X does not answer', async () => {
    fetchMock.mockRejectedValueOnce(new Error('timeout'));

    await expect(NextJsXPostService.fetch('20')).resolves.toBe(X_POST_FAILED);
  });

  it.each(['20/../x', '99999999999999999999', '020', ''])('reads nothing for the ID %j', async (id) => {
    await expect(NextJsXPostService.fetch(id)).resolves.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
