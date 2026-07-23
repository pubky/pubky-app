import sharp from 'sharp';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FileVariant } from '@/services/nexus/file/file.types';

vi.mock('@/services/nexus/file/file.api', () => ({
  filesApi: {
    getFileUrl: vi.fn(
      ({ pubky, file_id, variant }: { pubky: string; file_id: string; variant: string }) =>
        `https://cdn.test/files/${pubky}/${file_id}/${variant}`,
    ),
    getAvatarUrl: vi.fn((pubky: string, version?: string | number) =>
      version ? `https://cdn.test/avatar/${pubky}?v=${version}` : `https://cdn.test/avatar/${pubky}`,
    ),
  },
}));

const { buildAvatarUrl, fetchImageAsDataUri, fetchProfileForMetadata, resolvePostAttachmentUrl } =
  await import('./ogData');

const jsonResponse = (body: unknown) =>
  new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });

describe('resolvePostAttachmentUrl', () => {
  it('returns null for empty / whitespace / nullish input', () => {
    expect(resolvePostAttachmentUrl(null)).toBeNull();
    expect(resolvePostAttachmentUrl(undefined)).toBeNull();
    expect(resolvePostAttachmentUrl('')).toBeNull();
    expect(resolvePostAttachmentUrl('   ')).toBeNull();
  });

  it('rejects any non-pubky:// reference (SSRF guard — only CDN file URIs are fetched)', () => {
    // Absolute URLs (even http(s)) are NOT fetched — this prevents pointing the
    // server-side image fetch at arbitrary/internal hosts.
    expect(resolvePostAttachmentUrl('https://example.com/img.png')).toBeNull();
    expect(resolvePostAttachmentUrl('http://169.254.169.254/latest/meta-data')).toBeNull();
    expect(resolvePostAttachmentUrl('http://localhost:6379')).toBeNull();
    expect(resolvePostAttachmentUrl('data:image/png;base64,AAAA')).toBeNull();
    expect(resolvePostAttachmentUrl('file:///etc/passwd')).toBeNull();
    expect(resolvePostAttachmentUrl('not a url')).toBeNull();
  });

  it('resolves a pubky:// files URI to a CDN URL (default FEED variant)', () => {
    expect(resolvePostAttachmentUrl('pubky://userpk/pub/pubky.app/files/file123')).toBe(
      'https://cdn.test/files/userpk/file123/feed',
    );
  });

  it('resolves a pubky:// files URI with an explicit variant', () => {
    expect(resolvePostAttachmentUrl('pubky://userpk/pub/pubky.app/files/file123', FileVariant.MAIN)).toBe(
      'https://cdn.test/files/userpk/file123/main',
    );
  });

  it('returns null for a pubky:// URI without a files segment', () => {
    expect(resolvePostAttachmentUrl('pubky://userpk/pub/pubky.app/posts/post123')).toBeNull();
  });
});

describe('buildAvatarUrl', () => {
  it('returns null when the user has no avatar (falsy image flag)', () => {
    expect(buildAvatarUrl({ id: 'u1', image: null, indexed_at: 123 })).toBeNull();
  });

  it('builds the avatar CDN URL with indexed_at as the cache-busting version', () => {
    expect(buildAvatarUrl({ id: 'u1', image: 'pubky://u1/pub/pubky.app/files/av', indexed_at: 123 })).toBe(
      'https://cdn.test/avatar/u1?v=123',
    );
  });
});

describe('fetchProfileForMetadata', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns the user details and counts when both resolve', async () => {
    // First fetch = user details, second = counts (Promise.all array order).
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(jsonResponse({ name: 'Alice', bio: 'hi' }))
      .mockResolvedValueOnce(jsonResponse({ posts: 5, followers: 10 }));

    const result = await fetchProfileForMetadata('somepubky');

    expect(result?.user.name).toBe('Alice');
    expect(result?.counts.posts).toBe(5);
    expect(result?.counts.followers).toBe(10);
  });

  it('returns null when the user details are not found', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('Not Found', { status: 404 }));

    expect(await fetchProfileForMetadata('somepubky')).toBeNull();
  });

  it('defaults counts to zeros when the counts request 404s but the user resolves', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(jsonResponse({ name: 'Alice', bio: 'hi' }))
      .mockResolvedValueOnce(new Response('Not Found', { status: 404 }));

    const result = await fetchProfileForMetadata('somepubky');

    expect(result?.user.name).toBe('Alice');
    expect(result?.counts.posts).toBe(0);
    expect(result?.counts.followers).toBe(0);
  });
});

describe('fetchImageAsDataUri', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns null for a nullish / empty url without fetching', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    expect(await fetchImageAsDataUri(null)).toBeNull();
    expect(await fetchImageAsDataUri(undefined)).toBeNull();
    expect(await fetchImageAsDataUri('')).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('returns null when the response is not ok', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('nope', { status: 404 }));
    expect(await fetchImageAsDataUri('https://cdn.test/a.webp')).toBeNull();
  });

  it('returns null when the content-type is not an image', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('<html>', { status: 200, headers: { 'Content-Type': 'text/html' } }),
    );
    expect(await fetchImageAsDataUri('https://cdn.test/a.webp')).toBeNull();
  });

  it('returns null when the fetch throws', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network down'));
    expect(await fetchImageAsDataUri('https://cdn.test/a.webp')).toBeNull();
  });

  it('transcodes a fetched image to a base64 PNG data URI', async () => {
    const png = await sharp({ create: { width: 4, height: 4, channels: 3, background: { r: 200, g: 0, b: 0 } } })
      .png()
      .toBuffer();
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(new Uint8Array(png), { status: 200, headers: { 'Content-Type': 'image/png' } }),
    );

    const result = await fetchImageAsDataUri('https://cdn.test/a.png');

    expect(result).toMatch(/^data:image\/png;base64,/);
  });
});
