import type { Tweet } from 'react-tweet/api';
import { describe, expect, it } from 'vitest';
import videoFixture from '@/services/pinakes/fixtures/by-uri.video.json';
import type { TPinakesResourceDetail } from '@/services/pinakes/pinakes.types';
import { asOpaque } from '@/test-utils/type-assertions';
import { getXPostId, getXPostVideo, toXPost, withXPost } from './x-post';

const tweet = (overrides: Partial<Tweet> = {}): Tweet =>
  asOpaque<Tweet>({
    id_str: '20',
    text: 'just setting up my twttr &amp; more https://t.co/abc https://t.co/media',
    display_text_range: [0, 52],
    created_at: '2006-03-21T20:50:14.000Z',
    user: { name: 'jack', screen_name: 'jack' },
    entities: {
      urls: [
        {
          url: 'https://t.co/abc',
          expanded_url: 'https://example.com/page',
          display_url: 'example.com/page',
          indices: [36, 52],
        },
      ],
    },
    ...overrides,
  });

describe('getXPostId', () => {
  it.each([
    ['https://x.com/jack/status/20', '20'],
    ['https://twitter.com/jack/status/20?s=1', '20'],
    ['https://mobile.x.com/jack/status/20/photo/1', '20'],
    ['http://www.twitter.com/jack/status/20', '20'],
    ['https://x.com/jack/status/9223372036854775807', '9223372036854775807'],
  ])('reads %s', (link, id) => expect(getXPostId(link)).toBe(id));

  it.each([
    'https://x.com/jack',
    'https://x.com/jack/status/abc',
    'https://evil.example/jack/status/20',
    'https://x.com.evil.example/jack/status/20',
    'ftp://x.com/jack/status/20',
    `https://x.com/jack/status/${'1'.repeat(21)}`,
    'https://x.com/jack/status/9223372036854775808',
    'https://x.com/jack/status/020',
    'not a link',
    null,
  ])('reads no ID from %s', (link) => expect(getXPostId(link)).toBeNull());
});

describe('toXPost', () => {
  it('keeps the text in its display range, short links written out, entities unescaped', () => {
    expect(toXPost(tweet())).toEqual({
      id: '20',
      text: 'just setting up my twttr & more https://example.com/page',
      authorName: 'jack',
      handle: 'jack',
      published: '2006-03-21T20:50:14.000Z',
      image: null,
      images: [],
      hasVideo: false,
      video: null,
      videoAspect: null,
    });
  });

  it('keeps only media on X’s media host, a video’s still first, then the photos', () => {
    const post = toXPost(
      tweet({
        photos: asOpaque([{ url: 'https://pbs.twimg.com/media/a.jpg' }, { url: 'https://evil.example/b.jpg' }]),
        video: asOpaque({ poster: 'https://pbs.twimg.com/ext_tw_video_thumb/1/pu/img/still.jpg', variants: [] }),
      }),
    );
    expect(post?.images).toEqual([
      'https://pbs.twimg.com/ext_tw_video_thumb/1/pu/img/still.jpg',
      'https://pbs.twimg.com/media/a.jpg',
    ]);
    expect(post?.image).toBe('https://pbs.twimg.com/ext_tw_video_thumb/1/pu/img/still.jpg');
    expect(post?.hasVideo).toBe(true);
    expect(post?.video).toBeNull();
  });

  it('picks the video’s MP4 on X’s video host, the highest bit rate up to 720p, never a playlist or another host', () => {
    const variants = [
      { content_type: 'application/x-mpegURL', url: 'https://video.twimg.com/a.m3u8' },
      { content_type: 'video/mp4', bitrate: 256000, url: 'https://video.twimg.com/vid/320x180/a.mp4' },
      { content_type: 'video/mp4', bitrate: 2176000, url: 'https://video.twimg.com/vid/1280x720/a.mp4' },
      { content_type: 'video/mp4', bitrate: 10368000, url: 'https://video.twimg.com/vid/1920x1080/a.mp4' },
      { content_type: 'video/mp4', bitrate: 2000000, url: 'https://evil.example/a.mp4' },
    ];
    const post = toXPost(
      tweet({
        mediaDetails: asOpaque([
          {
            type: 'video',
            media_url_https: 'https://pbs.twimg.com/amplify_video_thumb/1/img/still.jpg',
            video_info: { variants },
          },
        ]),
      }),
    );
    expect(post?.video).toBe('https://video.twimg.com/vid/1280x720/a.mp4');
    expect(post?.image).toBe('https://pbs.twimg.com/amplify_video_thumb/1/img/still.jpg');
  });

  it('refuses an answer that is no post or says nothing', () => {
    expect(toXPost(null)).toBeNull();
    expect(toXPost(tweet({ id_str: 'x' }))).toBeNull();
    expect(toXPost(tweet({ text: '', display_text_range: [0, 0], entities: undefined }))).toBeNull();
  });
});

describe('withXPost', () => {
  const post = toXPost(tweet({ photos: asOpaque([{ url: 'https://pbs.twimg.com/media/a.jpg' }]) }))!;

  it('makes a settled social post card for a link with no card', () => {
    const card = withXPost(null, 'https://x.com/jack/status/20', post);
    expect(card).toMatchObject({
      uri: 'https://x.com/jack/status/20',
      status: 'ok',
      type: 'SocialMediaPosting',
      name: post.text,
      image: 'https://pbs.twimg.com/media/a.jpg',
      facts: { author: 'jack', author_name: 'jack', published: '2006-03-21T20:50:14.000Z' },
    });
  });

  it('carries a video into the card: its MP4 as the stream, so the post is a video post even with a photo first', () => {
    const video = { ...post, video: 'https://video.twimg.com/vid/1280x720/a.mp4', hasVideo: true };
    const card = withXPost(null, 'https://x.com/jack/status/20', video);
    expect(card.stream).toEqual({ url: video.video, type: 'video/mp4', preview: false });
    expect(getXPostVideo(card)).toBe(video.video);
    expect(
      getXPostVideo({ stream: { url: 'https://evil.example/a.mp4', type: 'video/mp4', preview: false } }),
    ).toBeNull();
  });

  it('marks a video with no MP4 by a video embed kind', () => {
    const card = withXPost(null, 'https://x.com/jack/status/20', { ...post, hasVideo: true, video: null });
    expect(card.embed?.kind).toBe('video');
    expect(card.stream).toBeNull();
  });

  it('keeps what Pinakes’ card has, its links and ID', () => {
    const pinakes: TPinakesResourceDetail = { ...videoFixture, status: 'pending', name: null };
    const card = withXPost(pinakes, 'https://x.com/jack/status/20', post);
    expect(card.id).toBe(videoFixture.id);
    expect(card.uri).toBe(videoFixture.uri);
    expect(card.also_on).toBe(pinakes.also_on);
    expect(card.status).toBe('ok');
  });
});
