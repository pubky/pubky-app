import { getValidMimeTypes } from 'pubky-app-specs';
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

  it('accepts every MIME type the 0.x package accepted, in the same order, plus text/csv', () => {
    // Both packages are installed while the port lands; the 0.x list is the baseline nobody loses.
    const legacy = getValidMimeTypes();
    expect(POST_SUPPORTED_ATTACHMENT_MIME_TYPES.filter((mime) => legacy.includes(mime))).toEqual(legacy);
    expect(POST_SUPPORTED_ATTACHMENT_MIME_TYPES.filter((mime) => !legacy.includes(mime))).toEqual(['text/csv']);
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
