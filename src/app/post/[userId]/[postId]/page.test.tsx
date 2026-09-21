import { permanentRedirect } from 'next/navigation';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Logger } from '@/libs/logger/logger';
import PostPage, { generateMetadata } from './page';

vi.mock('@/templates/Post/SinglePost/SinglePost', () => ({
  SinglePost: ({ postId }: { postId: string }) => <div data-testid="single-post">{postId}</div>,
}));

vi.mock('@/templates/Post/SinglePost/SinglePostPage', () => ({
  SinglePostPage: ({ postId }: { postId: string }) => <div data-testid="single-post-page" data-post-id={postId} />,
}));

// Preserve the rest of next/navigation; only stub permanentRedirect (which
// normally throws NEXT_REDIRECT) so we can assert the redirect target.
vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/navigation')>()),
  permanentRedirect: vi.fn(() => {
    throw new Error('NEXT_REDIRECT');
  }),
}));

describe('generateMetadata', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('falls back silently when post metadata returns not found', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    const loggerErrorSpy = vi.spyOn(Logger, 'error').mockImplementation(() => {});

    fetchMock
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ name: 'Alice' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      )
      .mockResolvedValueOnce(new Response('Not Found', { status: 404, statusText: 'Not Found' }));

    const metadata = await generateMetadata({
      params: Promise.resolve({
        userId: 'o1gg96ewuojmopcjbz8895478wdtxtzzber7aezq6ror5a91j7dy',
        postId: 'missing-post',
      }),
    });

    expect(metadata).toEqual({});
    expect(loggerErrorSpy).not.toHaveBeenCalled();
  });

  const jsonResponse = (body: unknown) =>
    new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });

  it.each(['0032PARTQP4G0]', '0032PARTQP4G0%5D', '0032PARTQP4G0!', '0032PARTQP4G0%21', '[0032PARTQP4G0'])(
    'returns fallback metadata without fetching for malformed post id %s',
    async (postId) => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch');
      const metadata = await generateMetadata({
        params: Promise.resolve({ userId: 'o1gg96ewuojmopcjbz8895478wdtxtzzber7aezq6ror5a91j7dy', postId }),
      });

      expect(metadata).toEqual({});
      expect(fetchSpy).not.toHaveBeenCalled();
    },
  );

  it('fetches metadata for a raw author key starting with pubky', async () => {
    const userId = `pubky${'o'.repeat(47)}`;
    const postId = '0032PARTQP4G0';
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(jsonResponse({ id: userId, name: 'Alice' }))
      .mockResolvedValueOnce(jsonResponse({ kind: 'short', content: 'hello world' }));

    const metadata = await generateMetadata({ params: Promise.resolve({ userId, postId }) });

    expect(metadata.title).toBe('Alice on Pubky');
    expect(metadata.alternates?.canonical).toBe(`/post/${userId}/${postId}`);
    expect(fetchSpy.mock.calls.map(([url]) => url)).toEqual([
      `https://nexus.staging.pubky.app/v0/user/${userId}/details`,
      `https://nexus.staging.pubky.app/v0/post/${userId}/${postId}/details`,
    ]);
  });

  it('canonicalizes collection-kind posts to /collections', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ name: 'Alice' }))
      .mockResolvedValueOnce(jsonResponse({ kind: 'collection', content: '{"name":"Art"}' }));

    const metadata = await generateMetadata({
      params: Promise.resolve({ userId: 'o1gg96ewuojmopcjbz8895478wdtxtzzber7aezq6ror5a91j7dy', postId: 'post-1' }),
    });

    expect(metadata).toEqual({
      alternates: { canonical: '/collections/o1gg96ewuojmopcjbz8895478wdtxtzzber7aezq6ror5a91j7dy/post-1' },
    });
  });

  it('builds title/description and omits static images for a normal post', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ name: 'Alice' }))
      .mockResolvedValueOnce(jsonResponse({ kind: 'short', content: 'hello world' }));

    const metadata = await generateMetadata({
      params: Promise.resolve({ userId: 'o1gg96ewuojmopcjbz8895478wdtxtzzber7aezq6ror5a91j7dy', postId: 'post-1' }),
    });

    expect(metadata.title).toBe('Alice on Pubky');
    expect(metadata.description).toBe('hello world');
    // Dynamic opengraph-image/twitter-image supply the image; no static one here.
    expect(metadata.openGraph).not.toHaveProperty('images');
    expect(metadata.twitter).not.toHaveProperty('images');
  });

  it('still emits title (no parent fallback) for a content-less post like a simple repost', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ name: 'Alice' }))
      .mockResolvedValueOnce(jsonResponse({ kind: 'short', content: '' }));

    const metadata = await generateMetadata({
      params: Promise.resolve({ userId: 'o1gg96ewuojmopcjbz8895478wdtxtzzber7aezq6ror5a91j7dy', postId: 'post-1' }),
    });

    // Title is present (not an empty {} that would fall back to parent metadata),
    // description is suppressed (null, not the parent's generic one), and the
    // dynamic OG image still applies via the file convention.
    expect(metadata.title).toBe('Alice on Pubky');
    expect(metadata.description).toBeNull();
    expect(metadata.openGraph?.title).toBe('Alice on Pubky');
    expect(metadata.openGraph?.description).toBe('');
  });
});

describe('PostPage (collection redirect)', () => {
  const jsonResponse = (body: unknown) =>
    new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });

  beforeEach(() => {
    vi.mocked(permanentRedirect).mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.each(['o1gg96ewuojmopcjbz8895478wdtxtzzber7aezq6ror5a91j7dy', `pubky${'o'.repeat(47)}`])(
    'permanently redirects a collection-kind post by %s to /collections',
    async (userId) => {
      vi.spyOn(globalThis, 'fetch')
        .mockResolvedValueOnce(jsonResponse({ name: 'Alice' }))
        .mockResolvedValueOnce(jsonResponse({ kind: 'collection', content: '{"name":"Art"}' }));

      await expect(
        PostPage({
          params: Promise.resolve({ userId, postId: 'post-1' }),
        }),
      ).rejects.toThrow('NEXT_REDIRECT');
      expect(permanentRedirect).toHaveBeenCalledWith(`/collections/${userId}/post-1`);
    },
  );

  it('renders the post (no redirect) for a non-collection post', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(jsonResponse({ name: 'Alice' }))
      .mockResolvedValueOnce(jsonResponse({ kind: 'short', content: 'hi' }));

    const element = await PostPage({
      params: Promise.resolve({ userId: 'o1gg96ewuojmopcjbz8895478wdtxtzzber7aezq6ror5a91j7dy', postId: 'post-1' }),
    });

    expect(permanentRedirect).not.toHaveBeenCalled();
    expect(element.props.postId).toBe('o1gg96ewuojmopcjbz8895478wdtxtzzber7aezq6ror5a91j7dy:post-1');
  });

  it('renders the post (no redirect) when the kind lookup fails', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('nexus down'));

    const element = await PostPage({
      params: Promise.resolve({ userId: 'o1gg96ewuojmopcjbz8895478wdtxtzzber7aezq6ror5a91j7dy', postId: 'post-1' }),
    });

    expect(permanentRedirect).not.toHaveBeenCalled();
    expect(element.props.postId).toBe('o1gg96ewuojmopcjbz8895478wdtxtzzber7aezq6ror5a91j7dy:post-1');
  });
});
