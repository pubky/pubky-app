import { describe, expect, it } from 'vitest';
import { PINAKES_URI_MAX_BYTES } from '@/config/pinakes';
import {
  getYouTubeThumbnailSource,
  IMAGE_EPISODE_MAX_LENGTH,
  IMAGE_SRC_MAX_LENGTH,
  ImageValidators,
  normalizeImageSrc,
} from './image.validators';

describe('ImageValidators.validateUri', () => {
  it('takes a card’s link as Pinakes is asked for it', () => {
    expect(ImageValidators.validateUri(' https://open.spotify.com/track/1 ')).toBe('https://open.spotify.com/track/1');
    expect(ImageValidators.validateUri('isbn:9780140328721')).toBe('isbn:9780140328721');
  });

  it.each([
    ['nothing', null],
    ['an empty value', '  '],
    ['no URI', 'not a link'],
    ['a link with credentials', 'https://user:pass@a.example/x'],
    ['a link longer than Pinakes reads', `https://a.example/${'a'.repeat(PINAKES_URI_MAX_BYTES)}`],
  ])('refuses %s', (_case, value) => {
    expect(ImageValidators.validateUri(value)).toBeNull();
  });
});

describe('normalizeImageSrc / ImageValidators.validateSrc', () => {
  it('spells an image address one way', () => {
    expect(normalizeImageSrc(' https://I.SCDN.co/image/ab ')).toBe('https://i.scdn.co/image/ab');
    expect(ImageValidators.validateSrc('http://www.dancarlin.com/graphics/x.jpg')).toBe(
      'http://www.dancarlin.com/graphics/x.jpg',
    );
    expect(normalizeImageSrc('https://a.example:443/x.png')).toBe('https://a.example/x.png');
  });

  it.each([
    ['nothing', undefined],
    ['no URL', 'cover.jpg'],
    ['another scheme', 'data:image/png;base64,AAAA'],
    ['a file', 'file:///etc/passwd'],
    ['a pubky link', 'pubky://a/pub/x.png'],
    ['credentials', 'https://user:pass@a.example/x.png'],
    ['another port', 'https://a.example:8443/x.png'],
    ['a very long address', `https://a.example/${'a'.repeat(IMAGE_SRC_MAX_LENGTH)}`],
  ])('reads no address with %s', (_case, value) => {
    expect(ImageValidators.validateSrc(value)).toBeNull();
  });
});

describe('ImageValidators.validateYouTube', () => {
  it('takes a video ID and a listed size, read from i.ytimg.com only', () => {
    const thumbnail = ImageValidators.validateYouTube('dQw4w9WgXcQ', 'hq720');
    expect(thumbnail).toEqual({ id: 'dQw4w9WgXcQ', variant: 'hq720' });
    expect(getYouTubeThumbnailSource(thumbnail!)).toBe('https://i.ytimg.com/vi/dQw4w9WgXcQ/hq720.jpg');
  });

  it.each([
    ['a short ID', 'dQw4w9WgXc', 'hq720'],
    ['a path in the ID', '../../x/abc', 'hq720'],
    ['a host in the ID', 'evil.exampl', 'mqdefault'],
    ['an unlisted size', 'dQw4w9WgXcQ', 'maxresdefault'],
    ['no size', 'dQw4w9WgXcQ', null],
  ])('refuses %s', (_case, id, variant) => {
    expect(ImageValidators.validateYouTube(id, variant)).toBeNull();
  });
});

describe('ImageValidators.validateEpisode', () => {
  it('takes an episode title, trimmed, and nothing when there is none', () => {
    expect(ImageValidators.validateEpisode(' 182: Episode ')).toBe('182: Episode');
    expect(ImageValidators.validateEpisode(null)).toBeUndefined();
  });

  it('refuses an empty or an over-long title', () => {
    expect(ImageValidators.validateEpisode('  ')).toBeNull();
    expect(ImageValidators.validateEpisode('a'.repeat(IMAGE_EPISODE_MAX_LENGTH + 1))).toBeNull();
  });
});
