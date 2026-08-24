import { describe, expect, it } from 'vitest';
import { getAttachmentPreviewUrl } from '@/libs/file/attachmentPreviewUrl';

describe('getAttachmentPreviewUrl', () => {
  it('prefers the FEED variant for images', () => {
    expect(getAttachmentPreviewUrl({ type: 'image/jpeg', urls: { main: 'main-url', feed: 'feed-url' } })).toBe(
      'feed-url',
    );
  });

  it('uses the MAIN variant for GIFs (Nexus FEED processing degrades them — workaround until fixed backend-side)', () => {
    expect(getAttachmentPreviewUrl({ type: 'image/gif', urls: { main: 'main-url', feed: 'feed-url' } })).toBe(
      'main-url',
    );
  });

  it('falls back to MAIN when no FEED variant exists (videos, audio, files)', () => {
    expect(getAttachmentPreviewUrl({ type: 'video/mp4', urls: { main: 'main-url' } })).toBe('main-url');
    expect(getAttachmentPreviewUrl({ type: 'image/png', urls: { main: 'main-url' } })).toBe('main-url');
  });

  it('returns null while urls are unresolved', () => {
    expect(getAttachmentPreviewUrl({ type: 'image/jpeg', urls: null })).toBeNull();
  });
});
