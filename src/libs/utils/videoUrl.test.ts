import { describe, expect, it } from 'vitest';
import { isVideoUrl } from '@/libs/utils/videoUrl';

describe('isVideoUrl', () => {
  it.each([
    ['https://www.youtube.com/watch?v=dQw4w9WgXcQ', 'youtube watch'],
    ['https://youtube.com/watch?v=dQw4w9WgXcQ', 'youtube watch without www'],
    ['https://m.youtube.com/watch?v=dQw4w9WgXcQ', 'youtube mobile'],
    ['https://music.youtube.com/watch?v=dQw4w9WgXcQ', 'youtube music'],
    ['https://youtu.be/dQw4w9WgXcQ', 'youtu.be short link'],
    ['https://www.youtube.com/shorts/dQw4w9WgXcQ', 'youtube shorts'],
    ['https://www.youtube.com/embed/dQw4w9WgXcQ', 'youtube embed'],
    ['https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ', 'youtube nocookie'],
    ['https://vimeo.com/123456789', 'vimeo'],
    ['https://player.vimeo.com/video/123456789', 'vimeo player'],
    ['https://cdn.example.com/clips/holiday.mp4', 'mp4 file'],
    ['https://cdn.example.com/clips/holiday.webm?token=abc', 'webm file with query'],
    ['https://cdn.example.com/clips/HOLIDAY.MP4', 'uppercase extension'],
    ['youtube.com/watch?v=dQw4w9WgXcQ', 'protocol-less youtube host'],
    ['cdn.example.com/clips/holiday.mov', 'protocol-less video file'],
  ])('returns true for %s (%s)', (url) => {
    expect(isVideoUrl(url)).toBe(true);
  });

  it.each([
    ['https://example.com/watch?v=dQw4w9WgXcQ', 'unrelated watch page'],
    ['https://example.com/video', 'path named video without an extension'],
    ['https://example.com/report.mp4.pdf', 'video extension that is not the file extension'],
    ['https://notyoutube.com/watch?v=dQw4w9WgXcQ', 'suffix lookalike host'],
    ['https://youtube.com.evil.example/watch?v=dQw4w9WgXcQ', 'youtube as a subdomain of another host'],
    ['https://myvimeo.com/123456789', 'prefix lookalike host'],
    ['mailto:test@example.com', 'non-http protocol'],
    ['ftp://example.com/clip.mp4', 'ftp protocol'],
    ['not a url', 'unparseable input'],
    ['', 'empty input'],
  ])('returns false for %s (%s)', (url) => {
    expect(isVideoUrl(url)).toBe(false);
  });
});
