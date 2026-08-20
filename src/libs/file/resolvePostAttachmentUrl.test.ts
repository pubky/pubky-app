import { describe, expect, it, vi } from 'vitest';
import { FileVariant } from '@/services/nexus/file/file.types';

vi.mock('@/services/nexus/file/file.api', () => ({
  filesApi: {
    getFileUrl: vi.fn(
      ({ pubky, file_id, variant }: { pubky: string; file_id: string; variant: string }) =>
        `https://cdn.test/files/${pubky}/${file_id}/${variant}`,
    ),
  },
}));

const { resolvePostAttachmentUrl } = await import('./resolvePostAttachmentUrl');

describe('resolvePostAttachmentUrl', () => {
  it('returns null for empty / whitespace / nullish input', () => {
    expect(resolvePostAttachmentUrl(null)).toBeNull();
    expect(resolvePostAttachmentUrl(undefined)).toBeNull();
    expect(resolvePostAttachmentUrl('')).toBeNull();
    expect(resolvePostAttachmentUrl('   ')).toBeNull();
  });

  it('rejects any non-pubky:// reference (SSRF guard — only CDN file URIs are used)', () => {
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
