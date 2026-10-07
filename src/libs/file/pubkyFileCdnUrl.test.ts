import { describe, expect, it, vi } from 'vitest';
import { FileVariant } from '@/services/nexus/file/file.types';
import { pubkyUriToCdnUrl } from './pubkyFileCdnUrl';

vi.mock('@/controllers/file/file', () => ({
  FileController: {
    getFileUrl: vi.fn(({ fileId, variant }: { fileId: string; variant: string }) => `cdn://${fileId}?v=${variant}`),
  },
}));

const PUBKY = 'o1gg96ewuojmopcjbz8895478wdtxtzzuxnfjjz8o8e77csa1ngo';

describe('pubkyUriToCdnUrl', () => {
  it('resolves homeserver file URIs to CDN URLs with the requested variant', () => {
    expect(pubkyUriToCdnUrl(`pubky://${PUBKY}/pub/pubky.app/files/file123`, FileVariant.MAIN)).toBe(
      `cdn://${PUBKY}:file123?v=main`,
    );
    expect(pubkyUriToCdnUrl(`pubky://${PUBKY}/pub/pubky.app/files/file123`, FileVariant.FEED)).toBe(
      `cdn://${PUBKY}:file123?v=feed`,
    );
  });

  it('trims surrounding whitespace', () => {
    expect(pubkyUriToCdnUrl(`  pubky://${PUBKY}/pub/pubky.app/files/file123  `, FileVariant.MAIN)).toBe(
      `cdn://${PUBKY}:file123?v=main`,
    );
  });

  it('returns null for nullish and empty input', () => {
    expect(pubkyUriToCdnUrl(null, FileVariant.MAIN)).toBeNull();
    expect(pubkyUriToCdnUrl(undefined, FileVariant.MAIN)).toBeNull();
    expect(pubkyUriToCdnUrl('', FileVariant.MAIN)).toBeNull();
    expect(pubkyUriToCdnUrl('   ', FileVariant.MAIN)).toBeNull();
  });

  it('returns null for non-pubky URLs', () => {
    expect(pubkyUriToCdnUrl('https://example.com/pic.png', FileVariant.MAIN)).toBeNull();
    expect(pubkyUriToCdnUrl('blob:https://app/123', FileVariant.MAIN)).toBeNull();
  });

  it('returns null for pubky URIs that are not file resources', () => {
    expect(pubkyUriToCdnUrl(`pubky://${PUBKY}/pub/pubky.app/posts/abc`, FileVariant.MAIN)).toBeNull();
    expect(pubkyUriToCdnUrl(`pubky://${PUBKY}/pub/pubky.app/files/`, FileVariant.MAIN)).toBeNull();
  });
});
