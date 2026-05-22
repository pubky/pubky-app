import { afterEach, describe, expect, it, vi } from 'vitest';
import { Logger } from '@/libs/logger/logger';
import { generateMetadata } from './page';

vi.mock('@/templates/Post/SinglePost/SinglePost', () => ({
  SinglePost: ({ postId }: { postId: string }) => <div data-testid="single-post">{postId}</div>,
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
});
