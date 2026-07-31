import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { asInvalid } from '@/test-utils/type-assertions';
import type { EmbedData } from '../../Providers/Provider.types';
import { InApp } from './ProviderInApp';

vi.mock('@/molecules/PostPreviewCard/PostPreviewCard', () => ({
  PostPreviewCard: ({ postId, className }: { postId: string; className?: string }) => (
    <div data-testid="post-preview-card" data-post-id={postId} className={className}>
      Mocked Post Preview Card
    </div>
  ),
}));

const PUBKY = 'o1gg96ewuojmopcjbz8895478wdtxtzzber7aezq6ror5a91j7dy';
const POST_ID = '0034BBBDFK83G';
// jsdom serves the tests from a localhost origin — in-app URLs are built from it
const ORIGIN = window.location.origin;

describe('ProviderInApp', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('domains', () => {
    it('exposes an empty domains array (matched via early check, not PROVIDER_MAP)', () => {
      expect(InApp.domains).toEqual([]);
    });
  });

  describe('parseEmbed', () => {
    it('returns post embed data for a current-origin post URL', () => {
      const result = InApp.parseEmbed(`${ORIGIN}/post/${PUBKY}/${POST_ID}`);

      expect(result).toEqual({
        type: 'post',
        value: `${PUBKY}:${POST_ID}`,
      });
    });

    it('returns post embed data for a current-origin collection URL', () => {
      const result = InApp.parseEmbed(`${ORIGIN}/collections/${PUBKY}/${POST_ID}`);

      expect(result).toEqual({
        type: 'post',
        value: `${PUBKY}:${POST_ID}`,
      });
    });

    it('handles trailing slashes', () => {
      const result = InApp.parseEmbed(`${ORIGIN}/post/${PUBKY}/${POST_ID}/`);

      expect(result).toEqual({
        type: 'post',
        value: `${PUBKY}:${POST_ID}`,
      });
    });

    it('handles query parameters and hash fragments', () => {
      expect(InApp.parseEmbed(`${ORIGIN}/post/${PUBKY}/${POST_ID}?utm_source=share`)).toEqual({
        type: 'post',
        value: `${PUBKY}:${POST_ID}`,
      });
      expect(InApp.parseEmbed(`${ORIGIN}/post/${PUBKY}/${POST_ID}#comments`)).toEqual({
        type: 'post',
        value: `${PUBKY}:${POST_ID}`,
      });
    });

    it('returns null for the bookmarks pseudo-collection route', () => {
      expect(InApp.parseEmbed(`${ORIGIN}/collections/bookmarks`)).toBeNull();
    });

    it('returns null for profile URLs', () => {
      expect(InApp.parseEmbed(`${ORIGIN}/profile/${PUBKY}`)).toBeNull();
    });

    it('returns null for wrong segment counts', () => {
      expect(InApp.parseEmbed(`${ORIGIN}/post/${PUBKY}`)).toBeNull();
      expect(InApp.parseEmbed(`${ORIGIN}/post/${PUBKY}/${POST_ID}/extra`)).toBeNull();
    });

    // Post ID shape is intentionally NOT validated — the app has no post-id
    // shape validator anywhere (the repost path resolves arbitrary ids the
    // same way). Nonexistent ids 404 downstream and PostPreviewCard renders
    // PostMissing, matching repost behavior; unindexed-but-real posts hydrate
    // into the full preview once Nexus indexes them.
    it('accepts any non-empty postId segment without shape validation', () => {
      expect(InApp.parseEmbed(`${ORIGIN}/post/${PUBKY}/typo`)).toEqual({
        type: 'post',
        value: `${PUBKY}:typo`,
      });
      expect(InApp.parseEmbed(`${ORIGIN}/collections/${PUBKY}/not-a-real-id`)).toEqual({
        type: 'post',
        value: `${PUBKY}:not-a-real-id`,
      });
    });

    it('returns null for an invalid user identifier', () => {
      expect(InApp.parseEmbed(`${ORIGIN}/post/not-a-pubky/${POST_ID}`)).toBeNull();
      expect(InApp.parseEmbed(`${ORIGIN}/post/${PUBKY.toUpperCase()}/${POST_ID}`)).toBeNull();
    });

    it('returns null for a different host', () => {
      expect(InApp.parseEmbed(`https://pubky.app/post/${PUBKY}/${POST_ID}`)).toBeNull();
    });

    it('matches the www-prefixed variant of the current host (same policy as link confirmation)', () => {
      const wwwUrl = `${window.location.protocol}//www.${window.location.host}/post/${PUBKY}/${POST_ID}`;

      expect(InApp.parseEmbed(wwwUrl)).toEqual({
        type: 'post',
        value: `${PUBKY}:${POST_ID}`,
      });
    });

    it('returns null for non-http(s) protocols', () => {
      expect(InApp.parseEmbed(`pubky://${PUBKY}/pub/pubky.app/posts/${POST_ID}`)).toBeNull();
    });

    it('returns null for invalid URLs', () => {
      expect(InApp.parseEmbed('not a url')).toBeNull();
    });
  });

  describe('renderEmbed', () => {
    it('renders PostPreviewCard with the composite id for post embed data', () => {
      const embedData = {
        type: 'post' as const,
        value: `${PUBKY}:${POST_ID}`,
      };

      render(<>{InApp.renderEmbed(embedData)}</>);

      const card = screen.getByTestId('post-preview-card');
      expect(card).toBeInTheDocument();
      expect(card).toHaveAttribute('data-post-id', `${PUBKY}:${POST_ID}`);
    });

    it('applies the repost preview contrast background', () => {
      render(<>{InApp.renderEmbed({ type: 'post', value: `${PUBKY}:${POST_ID}` })}</>);

      expect(screen.getByTestId('post-preview-card')).toHaveClass('bg-muted');
    });

    it('returns null for url embed data', () => {
      expect(InApp.renderEmbed({ type: 'url', value: 'https://example.com' })).toBeNull();
    });

    it('returns null for unknown embed data types', () => {
      expect(InApp.renderEmbed(asInvalid<EmbedData>({ type: 'unknown', value: 'x' }))).toBeNull();
    });
  });
});

describe('ProviderInApp - Snapshots', () => {
  it('matches snapshot for post embed', () => {
    const { container } = render(<>{InApp.renderEmbed({ type: 'post', value: `${PUBKY}:${POST_ID}` })}</>);

    expect(container.firstChild).toMatchSnapshot();
  });
});
