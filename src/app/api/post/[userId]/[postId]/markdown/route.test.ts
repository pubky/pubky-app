import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ClientErrorCode } from '@/libs/error/error.codes';
import { Err } from '@/libs/error/error.factories';
import { ErrorService } from '@/libs/error/error.types';
import { HttpStatusCode } from '@/libs/http/http.types';
import type { NexusPost, NexusPostDetails } from '@/services/nexus/nexus.types';
import { POST_ID_STAGING_FIXTURE, PUBKY_52_STAGING_FIXTURE } from '@/test-utils/pubky';
import { GET } from './route';

const mocks = vi.hoisted(() => ({
  fetchPostViewForServer: vi.fn(),
  fetchPostDetailsForServer: vi.fn(),
}));

vi.mock('@/libs/post/postMetadata', () => ({
  fetchPostViewForServer: mocks.fetchPostViewForServer,
  fetchPostDetailsForServer: mocks.fetchPostDetailsForServer,
}));

const USER_ID = PUBKY_52_STAGING_FIXTURE;
const POST_ID = POST_ID_STAGING_FIXTURE;

function details(overrides: Partial<NexusPostDetails> = {}): NexusPostDetails {
  return {
    id: POST_ID,
    content: 'hello **world**',
    indexed_at: 1_700_000_000_000,
    author: USER_ID,
    kind: 'short',
    uri: `pubky://${USER_ID}/pub/pubky.app/posts/${POST_ID}`,
    attachments: null,
    ...overrides,
  };
}

function context(userId = USER_ID, postId = POST_ID) {
  return { params: Promise.resolve({ userId, postId }) };
}

function view(
  detailOverrides: Partial<NexusPostDetails> = {},
  relationships: NexusPost['relationships'] = { replied: null, reposted: null, mentioned: [] },
): NexusPost {
  return {
    details: details(detailOverrides),
    counts: { tags: 0, unique_tags: 0, replies: 0, reposts: 0 },
    tags: [],
    relationships,
    bookmark: null,
  };
}

describe('API Route: /api/post/[userId]/[postId]/markdown', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 400 for an invalid pubky without fetching', async () => {
    const response = await GET(new Request('http://localhost/api/post/nope/abc/markdown'), context('nope', POST_ID));

    expect(response.status).toBe(400);
    expect(response.headers.get('Content-Type')).toBe('text/plain; charset=utf-8');
    expect(await response.text()).toBe('Invalid post');
    expect(mocks.fetchPostViewForServer).not.toHaveBeenCalled();
  });

  it('returns 400 for a post id that is not 13 characters without fetching', async () => {
    const response = await GET(
      new Request('http://localhost/api/post/x/doesnotexist/markdown'),
      context(USER_ID, 'doesnotexist'),
    );

    expect(response.status).toBe(400);
    expect(await response.text()).toBe('Invalid post');
    expect(mocks.fetchPostViewForServer).not.toHaveBeenCalled();
  });

  it('returns 404 when the post is missing', async () => {
    mocks.fetchPostViewForServer.mockResolvedValueOnce(null);

    const response = await GET(new Request('http://localhost/api/post/x/y/markdown'), context());

    expect(response.status).toBe(404);
    expect(await response.text()).toBe('Not found');
    expect(response.headers.get('Content-Type')).toBe('text/plain; charset=utf-8');
  });

  it('returns 404 for a deleted post', async () => {
    mocks.fetchPostViewForServer.mockResolvedValueOnce(view({ content: '[DELETED]' }));

    const response = await GET(new Request('http://localhost/api/post/x/y/markdown'), context());

    expect(response.status).toBe(404);
    expect(await response.text()).toBe('Not found');
  });

  it('returns 200 with markdown headers and stored content for a short post', async () => {
    mocks.fetchPostViewForServer.mockResolvedValueOnce(view());

    const response = await GET(new Request('http://localhost/api/post/x/y/markdown'), context());

    expect(response.status).toBe(200);
    expect(await response.text()).toBe('hello **world**');
    expect(response.headers.get('Content-Type')).toBe('text/markdown; charset=utf-8');
    expect(response.headers.get('Content-Disposition')).toBe(`inline; filename="${POST_ID}.md"`);
    expect(response.headers.get('Cache-Control')).toBe('public, s-maxage=3600, stale-while-revalidate=86400');
  });

  it('does not cache markdown for more than 1 hour', async () => {
    mocks.fetchPostViewForServer.mockResolvedValueOnce(view());

    const response = await GET(new Request('http://localhost/api/post/x/y/markdown'), context());
    const cacheControl = response.headers.get('Cache-Control') ?? '';
    const match = cacheControl.match(/s-maxage=(\d+)/);
    const sMaxAge = match ? Number(match[1]) : 0;

    expect(sMaxAge).toBeLessThanOrEqual(3600);
  });

  it('unwraps a long article to heading plus body', async () => {
    mocks.fetchPostViewForServer.mockResolvedValueOnce(
      view({ kind: 'long', content: JSON.stringify({ title: 'Title', body: 'Body text' }) }),
    );

    const response = await GET(new Request('http://localhost/api/post/x/y/markdown'), context());

    expect(response.status).toBe(200);
    expect(await response.text()).toBe('# Title\n\nBody text');
  });

  it('renders a collection as heading and description without items', async () => {
    mocks.fetchPostViewForServer.mockResolvedValueOnce(
      view({
        kind: 'collection',
        content: JSON.stringify({
          name: 'Favs',
          description: 'Stuff I like',
          items: ['pubky://author/pub/pubky.app/posts/abc'],
        }),
      }),
    );

    const response = await GET(new Request('http://localhost/api/post/x/y/markdown'), context());

    expect(response.status).toBe(200);
    expect(await response.text()).toBe('# Favs\n\nStuff I like');
  });

  it('includes image attachments as markdown after the caption', async () => {
    mocks.fetchPostViewForServer.mockResolvedValueOnce(
      view({
        kind: 'image',
        content: 'sunset',
        attachments: [`pubky://${USER_ID}/pub/pubky.app/files/img1`],
      }),
    );

    const response = await GET(new Request('http://localhost/api/post/x/y/markdown'), context());
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(body.startsWith('sunset\n\n![](')).toBe(true);
    expect(body).toContain('/img1/main');
  });

  it('returns 200 with an empty body for empty content', async () => {
    mocks.fetchPostViewForServer.mockResolvedValueOnce(view({ content: '' }));

    const response = await GET(new Request('http://localhost/api/post/x/y/markdown'), context());

    expect(response.status).toBe(200);
    expect(await response.text()).toBe('');
  });

  it('returns text/plain (not JSON) when Nexus fails', async () => {
    mocks.fetchPostViewForServer.mockRejectedValueOnce(new Error('Nexus down'));

    const response = await GET(new Request('http://localhost/api/post/x/y/markdown'), context());

    expect(response.status).toBe(502);
    expect(response.headers.get('Content-Type')).toBe('text/plain; charset=utf-8');
    expect(await response.text()).toBe('Post unavailable');
  });

  it('maps a Nexus 400 to Invalid post rather than 502', async () => {
    mocks.fetchPostViewForServer.mockRejectedValueOnce(
      Err.client(ClientErrorCode.BAD_REQUEST, 'Bad Request', {
        service: ErrorService.Nexus,
        operation: 'fetchPostDetails',
        context: { statusCode: HttpStatusCode.BAD_REQUEST },
      }),
    );

    const response = await GET(new Request('http://localhost/api/post/x/y/markdown'), context());

    expect(response.status).toBe(400);
    expect(await response.text()).toBe('Invalid post');
  });

  it('includes the original post as a blockquote for a quote', async () => {
    const originalId = '0035ORIGINAL1';
    mocks.fetchPostViewForServer.mockResolvedValueOnce(
      view(
        { content: 'my take' },
        {
          replied: null,
          reposted: `pubky://${USER_ID}/pub/pubky.app/posts/${originalId}`,
          mentioned: [],
        },
      ),
    );
    mocks.fetchPostDetailsForServer.mockResolvedValueOnce(
      details({ id: originalId, content: 'the original', uri: `pubky://${USER_ID}/pub/pubky.app/posts/${originalId}` }),
    );

    const response = await GET(new Request('http://localhost/api/post/x/y/markdown'), context());

    expect(await response.text()).toBe(`my take\n\n> the original\n>\n> — /post/${USER_ID}/${originalId}.md`);
    expect(mocks.fetchPostDetailsForServer).toHaveBeenCalledWith(USER_ID, originalId);
  });

  it('omits the quote and still returns 200 when the original fetch fails', async () => {
    const originalId = '0035ORIGINAL1';
    mocks.fetchPostViewForServer.mockResolvedValueOnce(
      view(
        { content: 'my take' },
        {
          replied: null,
          reposted: `pubky://${USER_ID}/pub/pubky.app/posts/${originalId}`,
          mentioned: [],
        },
      ),
    );
    mocks.fetchPostDetailsForServer.mockRejectedValueOnce(new Error('Nexus down'));

    const response = await GET(new Request('http://localhost/api/post/x/y/markdown'), context());

    expect(response.status).toBe(200);
    expect(await response.text()).toBe('my take');
  });

  it('prefixes a reply with a link to the parent and does not fetch it', async () => {
    const parentId = '0035PARENT000';
    mocks.fetchPostViewForServer.mockResolvedValueOnce(
      view(
        { content: 'agreed' },
        {
          replied: `pubky://${USER_ID}/pub/pubky.app/posts/${parentId}`,
          reposted: null,
          mentioned: [],
        },
      ),
    );

    const response = await GET(new Request('http://localhost/api/post/x/y/markdown'), context());

    expect(await response.text()).toBe(`In reply to: /post/${USER_ID}/${parentId}.md\n\nagreed`);
    expect(mocks.fetchPostDetailsForServer).not.toHaveBeenCalled();
  });
});
