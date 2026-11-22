import { describe, expect, it } from 'vitest';
import { getResourceImageUrl, getYouTubeThumbnailVideoId, RESOURCE_IMAGE_ROUTE } from './resourceImage';

describe('getResourceImageUrl', () => {
  it('names the card and the image on the app’s own route', () => {
    const url = getResourceImageUrl('https://open.spotify.com/track/1?si=a&b=c', 'https://i.scdn.co/image/ab&x=1');
    expect(url?.startsWith(`${RESOURCE_IMAGE_ROUTE}?`)).toBe(true);
    const params = new URL(url!, 'https://pubky.app').searchParams;
    expect(params.get('uri')).toBe('https://open.spotify.com/track/1?si=a&b=c');
    expect(params.get('src')).toBe('https://i.scdn.co/image/ab&x=1');
  });

  it('is null without an image', () => {
    expect(getResourceImageUrl('https://a.example/', null)).toBeNull();
    expect(getResourceImageUrl('https://a.example/', '')).toBeNull();
  });
});

describe('getYouTubeThumbnailVideoId', () => {
  it.each([
    ['https://i.ytimg.com/vi/bEV_7OjtFVk/hqdefault.jpg', 'bEV_7OjtFVk'],
    ['https://i.ytimg.com/vi_webp/bEV_7OjtFVk/maxresdefault.webp', 'bEV_7OjtFVk'],
    ['https://img.youtube.com/vi/dQw4w9WgXcQ/0.jpg', 'dQw4w9WgXcQ'],
    ['http://i.ytimg.com/vi/a-b_c1234XY/sddefault.jpg?sqp=x', 'a-b_c1234XY'],
    ['https://i.ytimg.com/vi/bEV_7OjtFVk/hq720.jpg', 'bEV_7OjtFVk'],
    ['https://i.ytimg.com/vi/bEV_7OjtFVk/mqdefault.jpg', 'bEV_7OjtFVk'],
  ])('reads the video ID of %s', (src, id) => {
    expect(getYouTubeThumbnailVideoId(src)).toBe(id);
  });

  it.each([
    null,
    undefined,
    '',
    'not a link',
    'https://i.ytimg.com/an/bEV_7OjtFVk/hqdefault.jpg',
    'https://i.ytimg.com/vi/short/hqdefault.jpg',
    'https://i.ytimg.com/vi/bEV_7OjtFVk%2F/hqdefault.jpg',
    'https://i.ytimg.com.example/vi/bEV_7OjtFVk/hqdefault.jpg',
    'https://example.com/vi/bEV_7OjtFVk/hqdefault.jpg',
    'ftp://i.ytimg.com/vi/bEV_7OjtFVk/hqdefault.jpg',
    'https://i.ytimg.com/vi/bEV_7OjtFVk',
    'https://i.ytimg.com/vi/bEV_7OjtFVk/',
    'https://i.ytimg.com/vi/bEV_7OjtFVk/a/hqdefault.jpg',
    'https://i.ytimg.com/vi/bEV_7OjtFVk/hq1.jpg',
    'https://i.ytimg.com/vi/bEV_7OjtFVk/2.jpg',
    'https://i.ytimg.com/vi/bEV_7OjtFVk/oardefault.jpg',
  ])('is null for %s', (src) => {
    expect(getYouTubeThumbnailVideoId(src)).toBeNull();
  });
});
