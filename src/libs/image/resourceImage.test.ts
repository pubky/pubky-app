import { describe, expect, it } from 'vitest';
import { getResourceImageUrl, RESOURCE_IMAGE_ROUTE } from './resourceImage';

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
