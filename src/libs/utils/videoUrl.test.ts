import { describe, expect, it } from 'vitest';
import { isVideoUrl, parseVideoUrl } from '@/libs/utils/videoUrl';

describe('isVideoUrl', () => {
  it.each([
    ['https://www.youtube.com/watch?v=dQw4w9WgXcQ', 'youtube watch'],
    ['https://youtube.com/watch?v=dQw4w9WgXcQ&t=30s', 'youtube watch with timestamp'],
    ['https://youtu.be/dQw4w9WgXcQ', 'youtu.be short link'],
    ['https://m.youtube.com/watch?v=dQw4w9WgXcQ', 'youtube mobile'],
    ['https://music.youtube.com/watch?v=dQw4w9WgXcQ', 'youtube music'],
    ['https://www.youtube.com/shorts/dQw4w9WgXcQ', 'youtube shorts'],
    ['https://www.youtube.com/live/dQw4w9WgXcQ', 'youtube live'],
    ['https://www.youtube.com/embed/dQw4w9WgXcQ', 'youtube embed'],
    ['https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ', 'youtube nocookie embed'],
    ['https://www.youtube.com/v/dQw4w9WgXcQ', 'youtube legacy /v/'],
    ['youtube.com/watch?v=dQw4w9WgXcQ', 'protocol-less youtube'],
    ['https://vimeo.com/123456789', 'vimeo video'],
    ['https://www.vimeo.com/123456789', 'vimeo video on www'],
    ['https://player.vimeo.com/video/123456789', 'vimeo player'],
    ['https://vimeo.com/channels/staffpicks/123456789', 'vimeo channel video'],
    ['https://vimeo.com/groups/motion/videos/123456789', 'vimeo group video'],
    ['https://vimeo.com/album/12345/video/67890', 'vimeo album video'],
    ['https://cdn.example.com/clips/holiday.mp4', 'direct mp4'],
    ['https://cdn.example.com/clips/holiday.MP4?token=abc', 'direct mp4 with query'],
    ['https://cdn.example.com/clips/holiday.webm', 'direct webm'],
  ])('is true for a playable video url (%s)', (url) => {
    expect(isVideoUrl(url)).toBe(true);
  });

  it.each([
    ['https://www.youtube.com/playlist?list=PL1234567890', 'youtube playlist'],
    ['https://www.youtube.com/@somechannel', 'youtube channel handle'],
    ['https://www.youtube.com/channel/UCabcdefghijklmnopqrstuv', 'youtube channel page'],
    ['https://www.youtube.com/about', 'youtube about page'],
    ['https://www.youtube.com/results?search_query=cats', 'youtube search results'],
    ['https://www.youtube.com/watch?v=tooshort', 'youtube id of the wrong length'],
    ['https://vimeo.com/channels/staffpicks', 'vimeo channel page'],
    ['https://vimeo.com/ondemand/somefilm', 'vimeo on demand page'],
    ['https://vimeo.com/user12345', 'vimeo user page'],
    ['https://notyoutube.com/watch?v=dQw4w9WgXcQ', 'lookalike host'],
    ['https://youtube.com.evil.example/watch?v=dQw4w9WgXcQ', 'video host as a subdomain label'],
    ['https://example.com/watch?v=dQw4w9WgXcQ', 'non-video host with a watch path'],
    ['https://example.com/video', 'non-video host'],
    ['https://example.com/clip.mp4.pdf', 'video extension inside a longer name'],
    ['ftp://example.com/clip.mp4', 'non-http protocol'],
    ['mailto:someone@example.com', 'mailto'],
    ['not a url', 'unparseable'],
    ['', 'empty'],
  ])('is false when the embed providers cannot play it (%s)', (url) => {
    expect(isVideoUrl(url)).toBe(false);
  });
});

describe('parseVideoUrl', () => {
  it.each([
    'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    'https://youtu.be/dQw4w9WgXcQ',
    'https://www.youtube.com/shorts/dQw4w9WgXcQ',
    'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ',
    'youtube.com/watch?v=dQw4w9WgXcQ',
  ])('returns the YouTube video id for %s', (url) => {
    expect(parseVideoUrl(url)).toEqual({ provider: 'youtube', videoId: 'dQw4w9WgXcQ' });
  });

  it('keeps the case of a YouTube video id', () => {
    expect(parseVideoUrl('https://YOUTU.BE/AbCdEfGhIjK')).toEqual({ provider: 'youtube', videoId: 'AbCdEfGhIjK' });
  });

  it.each([
    ['https://vimeo.com/123456789', '123456789'],
    ['https://player.vimeo.com/video/123456789', '123456789'],
    ['https://vimeo.com/channels/staffpicks/123456789', '123456789'],
    ['https://vimeo.com/album/12345/video/67890', '67890'],
  ])('returns the Vimeo video id for %s', (url, videoId) => {
    expect(parseVideoUrl(url)).toEqual({ provider: 'vimeo', videoId });
  });

  it.each([
    'https://cdn.example.com/clips/holiday.mp4',
    'https://cdn.example.com/clips/holiday.MP4?token=abc',
    'https://cdn.example.com/clips/holiday.mov',
  ])('returns a direct file for %s', (url) => {
    expect(parseVideoUrl(url)).toEqual({ provider: 'file' });
  });

  it.each([
    'https://www.youtube.com/playlist?list=PL1234567890',
    'https://www.youtube.com/clip.mp4',
    'https://vimeo.com/channels/staffpicks',
    'https://example.com/clip.mp4.pdf',
    'not a url',
  ])('returns null when there is nothing to play (%s)', (url) => {
    expect(parseVideoUrl(url)).toBeNull();
  });
});
