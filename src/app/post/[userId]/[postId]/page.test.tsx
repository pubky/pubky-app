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
      params: Promise.resolve({ userId: 'user-123', postId: 'missing-post' }),
    });

    expect(metadata).toEqual({});
    expect(loggerErrorSpy).not.toHaveBeenCalled();
  });

  it('canonicalizes collection-kind posts to /collections', async () => {
    const jsonResponse = (body: unknown) =>
      new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(jsonResponse({ name: 'Alice' }))
      .mockResolvedValueOnce(jsonResponse({ kind: 'collection', content: '{"name":"Art"}' }));

    const metadata = await generateMetadata({
      params: Promise.resolve({ userId: 'user-1', postId: 'post-1' }),
    });

    expect(metadata).toEqual({ alternates: { canonical: '/collections/user-1/post-1' } });
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

  it('permanently redirects a collection-kind post to /collections', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(jsonResponse({ name: 'Alice' }))
      .mockResolvedValueOnce(jsonResponse({ kind: 'collection', content: '{"name":"Art"}' }));

    await expect(PostPage({ params: Promise.resolve({ userId: 'user-1', postId: 'post-1' }) })).rejects.toThrow(
      'NEXT_REDIRECT',
    );
    expect(permanentRedirect).toHaveBeenCalledWith('/collections/user-1/post-1');
  });

  it('renders the post without redirecting for a non-collection post', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(jsonResponse({ name: 'Alice' }))
      .mockResolvedValueOnce(jsonResponse({ kind: 'short', content: 'hi' }));

    const element = await PostPage({ params: Promise.resolve({ userId: 'user-1', postId: 'post-1' }) });

    expect(permanentRedirect).not.toHaveBeenCalled();
    expect(element.props.postId).toBe('user-1:post-1');
  });

  it('renders the post without redirecting when the kind lookup fails', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('nexus down'));

    const element = await PostPage({ params: Promise.resolve({ userId: 'user-1', postId: 'post-1' }) });

    expect(permanentRedirect).not.toHaveBeenCalled();
    expect(element.props.postId).toBe('user-1:post-1');
  });
});
