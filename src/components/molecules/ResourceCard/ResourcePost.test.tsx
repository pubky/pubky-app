import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { getResourcePost, hasPostVideo, ResourcePost, showsPostFromCard } from './ResourcePost';

/** An X post as the candidate Pinakes answers it (`by-uri?uri=https://x.com/jack/status/20`). */
const X_POST = {
  status: 'ok',
  type: 'SocialMediaPosting',
  type_path: ['Thing', 'CreativeWork', 'Article', 'SocialMediaPosting'],
  name: 'just setting up my twttr',
  description: 'just setting up my twttr',
  embed: {
    provider: 'x',
    kind: 'post',
    src: 'https://platform.twitter.com/embed/Tweet.html?id=20&dnt=true',
    height: null,
    aspect: null,
    allow: [],
    autoplay_param: null,
  },
  facts: { author: 'jack', author_name: 'jack', published: '2006-03-21' },
};

describe('getResourcePost', () => {
  it('tells a social post from its card: text, author, handle and date', () => {
    expect(getResourcePost(X_POST)).toEqual({
      text: 'just setting up my twttr',
      authorName: 'jack',
      handle: 'jack',
      date: 'Mar 21, 2006',
    });
  });

  it('takes the longer text, a handle without its @, and the handle as the name when there is none', () => {
    expect(
      getResourcePost({ ...X_POST, name: 'Short', description: 'Short, and the rest', facts: { author: '@someone' } }),
    ).toEqual({ text: 'Short, and the rest', authorName: 'someone', handle: 'someone', date: null });
  });

  it('is null for any other card, a post with no text, or one Pinakes could not read', () => {
    expect(getResourcePost({ ...X_POST, type: 'VideoObject', type_path: ['Thing', 'VideoObject'] })).toBeNull();
    expect(getResourcePost({ ...X_POST, name: ' ', description: null })).toBeNull();
    expect(getResourcePost({ ...X_POST, status: 'unreachable' })).toBeNull();
    expect(getResourcePost({ ...X_POST, status: 'missing' })).toBeNull();
  });

  it('reads no post text in the name of the link’s shape alone, nor in a refused read’s description', () => {
    const shapeOnly = { ...X_POST, site: 'instagram.com', name: 'Post on instagram.com', facts: {} };
    expect(getResourcePost({ ...shapeOnly, description: null })).toBeNull();
    expect(
      getResourcePost({ ...shapeOnly, description: 'Blocked by the site.', facts: { blocked: 'true' } }),
    ).toBeNull();
    expect(showsPostFromCard({ ...shapeOnly, description: null })).toBe(false);
    // The same words on another site's card, or a real description beside them, are the post's.
    expect(getResourcePost({ ...shapeOnly, site: 'x.com', description: null })?.text).toBe('Post on instagram.com');
    expect(getResourcePost({ ...shapeOnly, description: 'A sunset' })?.text).toBe('A sunset');
  });

  it('reads no post text at all from a refused read, whatever its name', () => {
    expect(getResourcePost({ ...X_POST, name: 'Log in to X', facts: { blocked: 'true' } })).toBeNull();
  });

  it('knows the shape name by the host of the card’s link too, `www.` aside, when its site is a service name', () => {
    const card = {
      ...X_POST,
      uri: 'https://www.instagram.com/p/DgB34vHhlaT/',
      site: 'Instagram',
      name: 'Post on www.instagram.com',
      description: null,
      facts: {},
    };
    expect(getResourcePost(card)).toBeNull();
    expect(getResourcePost({ ...card, name: 'Post on instagram.com' })).toBeNull();
  });
});

describe('showsPostFromCard', () => {
  it('shows a text post from its card alone', () => {
    expect(hasPostVideo(X_POST)).toBe(false);
    expect(showsPostFromCard(X_POST)).toBe(true);
  });

  it.each([
    ['a video frame', { embed: { ...X_POST.embed, kind: 'video' } }],
    ['a video stream', { stream: { url: 'https://video.example/a.mp4', type: 'video/mp4', preview: false } }],
    ['a video type in its path', { type_path: [...X_POST.type_path, 'VideoObject'] }],
  ])('keeps the press for a post with %s', (_case, extra) => {
    const card = { ...X_POST, ...extra };
    expect(getResourcePost(card)).not.toBeNull();
    expect(hasPostVideo(card)).toBe(true);
    expect(showsPostFromCard(card)).toBe(false);
  });

  it.each([
    'https://pbs.twimg.com/ext_tw_video_thumb/1/pu/img/a.jpg',
    'https://pbs.twimg.com/amplify_video_thumb/2/img/b.jpg',
    'https://pbs.twimg.com/tweet_video_thumb/c.jpg',
  ])('keeps the press for an X post whose card or link preview image is a video still (%s)', (still) => {
    // The candidate's real X card: no video field, only its image (or its link's preview) says so.
    expect(showsPostFromCard({ ...X_POST, image: still })).toBe(false);
    expect(showsPostFromCard({ ...X_POST, image: null }, still)).toBe(false);
    expect(showsPostFromCard({ ...X_POST, image: null }, 'https://pbs.twimg.com/media/photo.jpg')).toBe(true);
  });

  it('keeps the press for a post Pinakes could not read', () => {
    expect(showsPostFromCard({ ...X_POST, status: 'unreachable' })).toBe(false);
  });
});

describe('ResourcePost', () => {
  const POST = { text: 'line one\nline two', authorName: 'Some One', handle: 'someone', date: 'Nov 20, 2026' };

  it('shows the author, handle, text and date, the text opening the resource page', () => {
    render(<ResourcePost post={POST} href="/resource?uri=x" />);

    expect(screen.getByTestId('resource-card-post-author')).toHaveTextContent('Some One@someone');
    expect(screen.getByRole('link', { name: /line one/ })).toHaveAttribute('href', '/resource?uri=x');
    expect(screen.getByTestId('resource-card-title')).toHaveClass('whitespace-pre-line', 'line-clamp-8');
    // As a post's header shows its time.
    expect(screen.getByTestId('resource-card-post-date')).toHaveTextContent('Nov 20, 2026');
  });

  it('is the resource page’s heading on the large card, not a link to the page itself', () => {
    render(<ResourcePost post={POST} href="/resource?uri=x" isLarge />);

    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('line one');
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });
});
