import { describe, expect, it } from 'vitest';
import { extractShopMetadata } from './shop-metadata.utils';

const DOCUMENT = new URL('https://pubky.app/shop-embed/marketplace/listing/seller/listing');

describe('extractShopMetadata', () => {
  it('decodes Shop copy and preserves the generated image query', () => {
    const html = `<meta property="og:title" content="Tom&#039;s &amp; Jerry&#039;s bag — 2,000 SAT" />
      <meta content="Listing ended. Handcrafted &amp; signed." property="og:description" />
      <meta property="og:image" content="${DOCUMENT.pathname}/opengraph-image?v=abc&amp;format=png" />`;

    expect(extractShopMetadata(html, DOCUMENT)).toEqual({
      title: "Tom's & Jerry's bag — 2,000 SAT",
      description: 'Listing ended. Handcrafted & signed.',
      image: `${DOCUMENT.href}/opengraph-image?v=abc&format=png`,
    });
  });

  it('does not promote a generic document title without Shop OG tags', () => {
    expect(extractShopMetadata('<title>Proxy unavailable</title>', DOCUMENT)).toBeNull();
  });

  it.each([
    'https://evil.example/image.png',
    '//evil.example/image.png',
    'data:image/png;base64,aGVsbG8=',
    'javascript:alert(1)',
    'https://user:password@pubky.app/shop-embed/marketplace/listing/seller/listing/opengraph-image',
    '/shop/marketplace/listing/seller/listing/opengraph-image',
    '/shop-embed/api/private',
    '/shop-embed/marketplace/listing/other/listing/opengraph-image',
  ])('refuses an image outside this listing image route: %s', (image) => {
    const result = extractShopMetadata(
      `<meta property="og:title" content="Listing" /><meta property="og:image" content="${image}" />`,
      DOCUMENT,
    );

    expect(result).toEqual({ title: 'Listing', description: '', image: null });
  });
});
