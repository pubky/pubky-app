import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TITLE_TRUNCATE_LENGTH, URL_TRUNCATE_LENGTH } from '@/config/urls';
import { AuthErrorCode } from '@/libs/error/error.codes';
import { ErrorCategory } from '@/libs/error/error.types';
import { HttpStatusCode } from '@/libs/http/http.types';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockNormalizeImageUrl = vi.hoisted(() => vi.fn());

vi.mock('../nextjs.utils', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../nextjs.utils')>();
  return {
    ...actual,
    normalizeImageUrl: mockNormalizeImageUrl,
  };
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('detectMediaType', () => {
  let detectMediaType: typeof import('./og-metadata.utils').detectMediaType;

  beforeEach(async () => {
    vi.resetModules();
    const mod = await import('./og-metadata.utils');
    detectMediaType = mod.detectMediaType;
  });

  it('should return image type for image content type', () => {
    const response = new Response(null, { headers: { 'content-type': 'image/png' } });
    expect(detectMediaType('https://example.com/pic.png', response)).toEqual({
      url: 'https://example.com/pic.png',
      type: 'image',
    });
  });

  it('should return video type for video content type', () => {
    const response = new Response(null, { headers: { 'content-type': 'video/mp4' } });
    expect(detectMediaType('https://example.com/vid.mp4', response)).toEqual({
      url: 'https://example.com/vid.mp4',
      type: 'video',
    });
  });

  it('should return audio type for audio content type', () => {
    const response = new Response(null, { headers: { 'content-type': 'audio/mpeg' } });
    expect(detectMediaType('https://example.com/song.mp3', response)).toEqual({
      url: 'https://example.com/song.mp3',
      type: 'audio',
    });
  });

  it('should return null for non-media content type', () => {
    const response = new Response(null, { headers: { 'content-type': 'text/html' } });
    expect(detectMediaType('https://example.com/', response)).toBeNull();
  });
});

describe('extractMetadata', () => {
  let extractMetadata: typeof import('./og-metadata.utils').extractMetadata;

  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    mockNormalizeImageUrl.mockResolvedValue(null);
    const mod = await import('./og-metadata.utils');
    extractMetadata = mod.extractMetadata;
  });

  it('should extract og:title from HTML', async () => {
    const html = '<html><head><meta property="og:title" content="My Title" /></head></html>';
    const result = await extractMetadata('https://example.com/', html);
    expect(result.title).toBe('My Title');
    expect(result.type).toBe('website');
  });

  it('should fallback to <title> tag when og:title is missing', async () => {
    const html = '<html><head><title>Fallback</title></head></html>';
    const result = await extractMetadata('https://example.com/', html);
    expect(result.title).toBe('Fallback');
  });

  it('should decode HTML entities in title', async () => {
    const html = '<html><head><meta property="og:title" content="A &amp; B" /></head></html>';
    const result = await extractMetadata('https://example.com/', html);
    expect(result.title).toBe('A & B');
  });

  it('should return null title when no title is found', async () => {
    const html = '<html><head></head></html>';
    const result = await extractMetadata('https://example.com/', html);
    expect(result.title).toBeNull();
  });

  it('should ignore the placeholder "undefined" that client-rendered shells serve for og:title and <title>', async () => {
    const html = '<html><head><meta property="og:title" content="undefined" /><title>undefined</title></head></html>';
    const result = await extractMetadata('https://music.youtube.com/playlist?list=OLAK5uy_x', html);
    expect(result.title).toBeNull();
  });

  it('should match placeholders exactly, keeping a title that differs only by case', async () => {
    const html = '<html><head><meta property="og:title" content="  Null  " /></head></html>';
    const result = await extractMetadata('https://example.com/', html);
    expect(result.title).toBe('Null');
  });

  it('should ignore a placeholder og:title with surrounding whitespace', async () => {
    const html = '<html><head><meta property="og:title" content="  undefined  " /></head></html>';
    const result = await extractMetadata('https://example.com/', html);
    expect(result.title).toBeNull();
  });

  it('should ignore a placeholder og:title that is entity-encoded', async () => {
    const html = '<html><head><meta property="og:title" content="undefined&nbsp;" /></head></html>';
    const result = await extractMetadata('https://example.com/', html);
    expect(result.title).toBeNull();
  });

  it('should fall back to <title> when og:title is whitespace only', async () => {
    const html = '<html><head><meta property="og:title" content="&nbsp;" /><title>Real Title</title></head></html>';
    const result = await extractMetadata('https://example.com/', html);
    expect(result.title).toBe('Real Title');
  });

  it('should ignore a "null" placeholder title', async () => {
    const html = '<html><head><meta property="og:title" content="null" /></head></html>';
    const result = await extractMetadata('https://example.com/', html);
    expect(result.title).toBeNull();
  });

  it('should fall back to <title> when og:title is a placeholder', async () => {
    const html = '<html><head><meta property="og:title" content="undefined" /><title>Real Title</title></head></html>';
    const result = await extractMetadata('https://example.com/', html);
    expect(result.title).toBe('Real Title');
  });

  it('should not resolve a placeholder og:image against the page URL', async () => {
    const html =
      '<html><head><meta property="og:title" content="Real Title" /><meta property="og:image" content="undefined" /></head></html>';
    const result = await extractMetadata('https://music.youtube.com/playlist?list=OLAK5uy_x', html);
    expect(mockNormalizeImageUrl).not.toHaveBeenCalled();
    expect(result.image).toBeNull();
  });

  it('should call normalizeImageUrl when og:image is found', async () => {
    mockNormalizeImageUrl.mockResolvedValue('https://example.com/img.png');
    const html = '<html><head><meta property="og:image" content="/img.png" /></head></html>';
    const result = await extractMetadata('https://example.com/', html);
    expect(mockNormalizeImageUrl).toHaveBeenCalledWith('/img.png', 'https://example.com/');
    expect(result.image).toBe('https://example.com/img.png');
  });

  it('should decode HTML entities in og:image before normalizing it', async () => {
    mockNormalizeImageUrl.mockResolvedValue('https://example.com/img.png');
    const html =
      '<html><head><meta property="og:image" content="https://cdn.example.com/a.jpg?w=600&amp;h=400" /></head></html>';
    const result = await extractMetadata('https://example.com/', html);
    expect(mockNormalizeImageUrl).toHaveBeenCalledWith(
      'https://cdn.example.com/a.jpg?w=600&h=400',
      'https://example.com/',
    );
    expect(result.image).toBe('https://example.com/img.png');
  });

  it('should not call normalizeImageUrl when og:image is missing', async () => {
    const html = '<html><head><meta property="og:title" content="Test" /></head></html>';
    const result = await extractMetadata('https://example.com/', html);
    expect(mockNormalizeImageUrl).not.toHaveBeenCalled();
    expect(result.image).toBeNull();
  });

  it('should truncate long URLs with middle ellipsis', async () => {
    const longUrl = 'https://example.com/' + 'a'.repeat(200);
    const html = '<html><head><meta property="og:title" content="Test" /></head></html>';
    const result = await extractMetadata(longUrl, html);
    expect(result.url).toContain('...');
    expect(result.url.length).toBeLessThanOrEqual(URL_TRUNCATE_LENGTH);
  });

  it('should truncate long titles with trailing ellipsis', async () => {
    const longTitle = 'A'.repeat(200);
    const html = `<html><head><meta property="og:title" content="${longTitle}" /></head></html>`;
    const result = await extractMetadata('https://example.com/', html);
    expect(result.title).toContain('...');
    expect(result.title!.length).toBe(TITLE_TRUNCATE_LENGTH + '...'.length);
  });
});

describe('buildFallbackMetadata', () => {
  let buildFallbackMetadata: typeof import('./og-metadata.utils').buildFallbackMetadata;

  beforeEach(async () => {
    vi.resetModules();
    const mod = await import('./og-metadata.utils');
    buildFallbackMetadata = mod.buildFallbackMetadata;
  });

  it('should return metadata with null title and image', () => {
    const result = buildFallbackMetadata('https://example.com/blocked');
    expect(result).toEqual({
      url: 'https://example.com/blocked',
      title: null,
      image: null,
      type: 'website',
    });
  });

  it('should truncate long URLs', () => {
    const longUrl = 'https://example.com/' + 'a'.repeat(200);
    const result = buildFallbackMetadata(longUrl);
    expect(result.url).toContain('...');
    expect(result.url.length).toBeLessThanOrEqual(URL_TRUNCATE_LENGTH);
  });
});

describe('hasOgMetadata', () => {
  let hasOgMetadata: typeof import('./og-metadata.utils').hasOgMetadata;

  beforeEach(async () => {
    vi.resetModules();
    const mod = await import('./og-metadata.utils');
    hasOgMetadata = mod.hasOgMetadata;
  });

  it('should return true for an og:title tag', () => {
    expect(hasOgMetadata('<html><head><meta property="og:title" content="Title" /></head></html>')).toBe(true);
  });

  it('should return true for an og:image tag', () => {
    expect(hasOgMetadata('<html><head><meta property="og:image" content="/img.png" /></head></html>')).toBe(true);
  });

  it('should return false for a page with only a <title> tag', () => {
    expect(hasOgMetadata('<html><head><title>Reddit - The heart of the internet</title></head></html>')).toBe(false);
  });

  it('should return false for a head with no metadata', () => {
    expect(hasOgMetadata('<html><head></head><body></body></html>')).toBe(false);
  });

  it('should return false for an empty og:title value', () => {
    expect(hasOgMetadata('<html><head><meta property="og:title" content="" /></head></html>')).toBe(false);
  });

  it('should return false when the only tags are placeholders', () => {
    const html =
      '<html><head><meta property="og:title" content="undefined" /><meta property="og:image" content="null" /><title>undefined</title></head></html>';
    expect(hasOgMetadata(html)).toBe(false);
  });
});

describe('validateRedirectUrl', () => {
  let validateRedirectUrl: typeof import('./og-metadata.utils').validateRedirectUrl;

  beforeEach(async () => {
    vi.resetModules();
    const mod = await import('./og-metadata.utils');
    validateRedirectUrl = mod.validateRedirectUrl;
  });

  it('should return null for non-redirect status (2xx)', () => {
    const response = new Response(null, { status: 200 });
    expect(validateRedirectUrl(response, 'https://example.com/')).toBeNull();
  });

  it('should return null for non-redirect status (4xx)', () => {
    const response = new Response(null, { status: 404 });
    expect(validateRedirectUrl(response, 'https://example.com/')).toBeNull();
  });

  it('should return null for non-redirect status (5xx)', () => {
    const response = new Response(null, { status: 500 });
    expect(validateRedirectUrl(response, 'https://example.com/')).toBeNull();
  });

  it('should return null for 301 WITHOUT Location header', () => {
    const response = new Response(null, { status: 301 });
    expect(validateRedirectUrl(response, 'https://example.com/')).toBeNull();
  });

  it('should return redirect URL for 301 with Location header', () => {
    const response = new Response(null, { status: 301, headers: { location: 'https://other.com/page' } });
    expect(validateRedirectUrl(response, 'https://other.com/page')).toEqual(new URL('https://other.com/page'));
  });

  it('should resolve relative Location against current URL', () => {
    const response = new Response(null, { status: 301, headers: { location: '/new-path' } });
    const result = validateRedirectUrl(response, 'https://example.com/old-path');
    expect(result?.toString()).toBe('https://example.com/new-path');
  });

  it('should throw for non-HTTP protocol redirect', () => {
    const response = new Response(null, { status: 302, headers: { location: 'ftp://example.com/data' } });
    expect(() => validateRedirectUrl(response, 'https://example.com/')).toThrow(
      expect.objectContaining({
        category: ErrorCategory.Auth,
        code: AuthErrorCode.FORBIDDEN,
        context: { protocol: 'ftp:', statusCode: HttpStatusCode.FORBIDDEN },
      }),
    );
  });

  it('should not throw for HTTP protocol redirect', () => {
    const response = new Response(null, { status: 302, headers: { location: 'https://other.com/page' } });
    expect(() => validateRedirectUrl(response, 'https://example.com/')).not.toThrow();
  });
});
