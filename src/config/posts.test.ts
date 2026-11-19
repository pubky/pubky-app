import { describe, expect, it } from 'vitest';
import {
  ARTICLE_MAX_CHARACTER_LENGTH,
  ARTICLE_SUPPORTED_ATTACHMENT_MIME_TYPES,
  COLLECTION_COVER_IMAGE_URL_MAX_LENGTH,
  COLLECTION_ITEM_URI_MAX_LENGTH,
  LOCK_TEASER_MAX_CHARACTER_LENGTH,
  POST_MAX_CHARACTER_LENGTH,
  POST_SUPPORTED_ATTACHMENT_MIME_TYPES,
} from '@/config/posts';

describe('post limits sourced from pubky-social-specs', () => {
  it('keeps the 0.x values where the semantics did not change', () => {
    expect(POST_MAX_CHARACTER_LENGTH).toBe(2000);
    expect(ARTICLE_MAX_CHARACTER_LENGTH).toBe(50_000);
    expect(LOCK_TEASER_MAX_CHARACTER_LENGTH).toBe(2000 - 100 - 41);
  });

  it('widens the collection URL limits to the v1 reference and image URL limits (accepted policy)', () => {
    expect(COLLECTION_ITEM_URI_MAX_LENGTH).toBe(1024);
    expect(COLLECTION_COVER_IMAGE_URL_MAX_LENGTH).toBe(300);
  });

  it('accepts exactly the MIME types the 0.x package accepted, in the same order', () => {
    // The 0.x `getValidMimeTypes()` list. The v1 table also allows text/csv; supporting it is a
    // deferred follow-up, so the list stays pinned to the 0.x one.
    expect(POST_SUPPORTED_ATTACHMENT_MIME_TYPES).toEqual([
      'application/javascript',
      'application/json',
      'application/octet-stream',
      'application/pdf',
      'application/x-www-form-urlencoded',
      'application/xml',
      'application/zip',
      'audio/mpeg',
      'audio/wav',
      'image/gif',
      'image/jpeg',
      'image/png',
      'image/svg+xml',
      'image/webp',
      'multipart/form-data',
      'text/css',
      'text/html',
      'text/plain',
      'text/xml',
      'video/mp4',
      'video/mpeg',
    ]);
    expect(POST_SUPPORTED_ATTACHMENT_MIME_TYPES).not.toContain('text/csv');
  });

  it('keeps the article cover image-only', () => {
    expect(ARTICLE_SUPPORTED_ATTACHMENT_MIME_TYPES).toEqual([
      'image/gif',
      'image/jpeg',
      'image/png',
      'image/svg+xml',
      'image/webp',
    ]);
  });
});
