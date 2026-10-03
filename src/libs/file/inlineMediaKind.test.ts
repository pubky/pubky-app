import { describe, expect, it } from 'vitest';
import {
  getInlineMediaKindFromMime,
  inferMediaKindFromUrl,
  INLINE_MEDIA_KINDS,
  isInlineNonImageMediaKind,
} from './inlineMediaKind';

describe('getInlineMediaKindFromMime', () => {
  it.each([
    ['image/png', 'image'],
    ['image/svg+xml', 'image'],
    ['video/mp4', 'video'],
    ['video/mpeg', 'video'],
    ['audio/mpeg', 'audio'],
    ['audio/wav', 'audio'],
    ['application/pdf', 'pdf'],
  ] as const)('maps %s to %s', (mime, kind) => {
    expect(getInlineMediaKindFromMime(mime)).toBe(kind);
  });

  it('normalizes case and whitespace', () => {
    expect(getInlineMediaKindFromMime(' Video/MP4 ')).toBe('video');
  });

  it('returns null for unsupported or missing types', () => {
    expect(getInlineMediaKindFromMime('application/zip')).toBeNull();
    expect(getInlineMediaKindFromMime('text/plain')).toBeNull();
    expect(getInlineMediaKindFromMime('')).toBeNull();
    expect(getInlineMediaKindFromMime(null)).toBeNull();
    expect(getInlineMediaKindFromMime(undefined)).toBeNull();
  });

  it('lists every kind once', () => {
    expect(INLINE_MEDIA_KINDS).toEqual(['image', 'video', 'audio', 'pdf']);
  });
});

describe('isInlineNonImageMediaKind', () => {
  it('accepts the three non-image kinds and nothing else', () => {
    expect(isInlineNonImageMediaKind('video')).toBe(true);
    expect(isInlineNonImageMediaKind('audio')).toBe(true);
    expect(isInlineNonImageMediaKind('pdf')).toBe(true);
    expect(isInlineNonImageMediaKind('image')).toBe(false);
    expect(isInlineNonImageMediaKind('')).toBe(false);
    expect(isInlineNonImageMediaKind(undefined)).toBe(false);
    expect(isInlineNonImageMediaKind({ kind: 'video' })).toBe(false);
  });
});

describe('inferMediaKindFromUrl', () => {
  it.each([
    ['https://host/clip.mp4', 'video'],
    ['https://host/clip.MOV', 'video'],
    ['https://host/path/to/clip.webm', 'video'],
    ['https://host/song.mp3', 'audio'],
    ['https://host/song.flac', 'audio'],
    ['https://host/paper.pdf', 'pdf'],
  ] as const)('classifies %s as %s', (url, kind) => {
    expect(inferMediaKindFromUrl(url)).toBe(kind);
  });

  it('ignores query strings and fragments', () => {
    expect(inferMediaKindFromUrl('https://host/clip.mp4?token=abc#t=10')).toBe('video');
    expect(inferMediaKindFromUrl('https://host/page?file=clip.mp4')).toBeNull();
    expect(inferMediaKindFromUrl('https://host/page#clip.mp4')).toBeNull();
  });

  it('never returns image, so external images keep their existing path', () => {
    expect(inferMediaKindFromUrl('https://host/photo.png')).toBeNull();
    expect(inferMediaKindFromUrl('https://host/photo.jpg')).toBeNull();
  });

  it('returns null without a usable extension', () => {
    expect(inferMediaKindFromUrl('https://host/clip')).toBeNull();
    expect(inferMediaKindFromUrl('https://host/clip.')).toBeNull();
    expect(inferMediaKindFromUrl('https://host/.mp4')).toBeNull();
    expect(inferMediaKindFromUrl('https://host/')).toBeNull();
  });

  it('returns null for page URLs of video sites', () => {
    expect(inferMediaKindFromUrl('https://www.youtube.com/watch?v=abc123')).toBeNull();
    expect(inferMediaKindFromUrl('https://vimeo.com/123456')).toBeNull();
  });

  it('accepts https only', () => {
    expect(inferMediaKindFromUrl('http://host/clip.mp4')).toBeNull();
    expect(inferMediaKindFromUrl('javascript:alert(1).mp4')).toBeNull();
    expect(inferMediaKindFromUrl('pubky://user/pub/pubky.app/files/clip.mp4')).toBeNull();
    expect(inferMediaKindFromUrl('blob:https://host/clip.mp4')).toBeNull();
  });

  it('returns null for malformed or missing input', () => {
    expect(inferMediaKindFromUrl('not a url')).toBeNull();
    expect(inferMediaKindFromUrl('')).toBeNull();
    expect(inferMediaKindFromUrl(null)).toBeNull();
    expect(inferMediaKindFromUrl(undefined)).toBeNull();
  });
});
