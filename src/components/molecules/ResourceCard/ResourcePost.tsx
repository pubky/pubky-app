'use client';

import { Container } from '@/atoms/Container/Container';
import { Link } from '@/atoms/Link/Link';
import { Typography } from '@/atoms/Typography/Typography';
import { cn } from '@/libs/utils/utils';
import { PostHeaderTimestamp } from '@/molecules/PostHeaderTimestamp/PostHeaderTimestamp';
import { PinakesStatus, type TPinakesCard, type TPinakesResourceDetail } from '@/services/pinakes/pinakes.types';
import { getNearestTypes, getResourceStatus } from './ResourceCard.utils';
import { formatFactDate, getFact } from './ResourceFacts.utils';

/** A social post as its card tells it: who wrote it, what and when. */
export interface TResourcePost {
  text: string;
  authorName: string | null;
  /** The author's handle, without `@`. */
  handle: string | null;
  date: string | null;
}

/** The facts a post's own lines say (author, handle, date): the large card's Details leave them out. */
export const RESOURCE_POST_FACTS: readonly string[] = ['author', 'author_name', 'published'];

type TPostCard = Pick<TPinakesCard, 'type' | 'type_path' | 'name' | 'description' | 'status' | 'embed'> &
  Partial<Pick<TPinakesCard, 'image'>> &
  Partial<Pick<TPinakesResourceDetail, 'facts' | 'stream'>>;

/**
 * A settled (`ok`) card that is a social post (`SocialMediaPosting`: an X, Mastodon or Bluesky post) as
 * a post: its text (the longer of its name and description, which Pinakes fills from the same text),
 * author (`facts.author_name`, `facts.author` as the handle) and date (`facts.published`); `null` for
 * any other card, a post with no text, or one Pinakes could not read (`missing`, `unreachable`, ...),
 * which keeps its way out to the post (Show on, the link).
 */
export function getResourcePost(card: TPostCard): TResourcePost | null {
  if (getResourceStatus(card.status) !== PinakesStatus.OK) return null;
  if (!getNearestTypes(card).includes('SocialMediaPosting')) return null;
  const name = card.name?.trim() ?? '';
  const description = card.description?.trim() ?? '';
  const text = description.length > name.length ? description : name;
  if (!text) return null;
  const handle = getFact(card, 'author')?.trim().replace(/^@/, '') || null;
  const authorName = getFact(card, 'author_name')?.trim() || null;
  return {
    text,
    authorName: authorName ?? handle,
    handle,
    date: formatFactDate(getFact(card, 'published')),
  };
}

/**
 * X's still of a post's video (`pbs.twimg.com/ext_tw_video_thumb/…`, `amplify_video_thumb/…`,
 * `tweet_video_thumb/…`): Pinakes types an X post with a video as any post, so this is how it shows.
 */
const X_VIDEO_THUMBNAIL = /^https?:\/\/pbs\.twimg\.com\/(ext_tw_video_thumb|amplify_video_thumb|tweet_video_thumb)\//i;

/**
 * Whether a card's post carries a video (`embed` of kind `video`, a `video/*` stream, a `VideoObject`
 * type, or an X video still as its image or its link's preview image, `previewImage`): its text and
 * image show from the card's data, and the video keeps a press that loads it.
 */
export function hasPostVideo(card: TPostCard, previewImage?: string | null): boolean {
  return (
    card.embed?.kind === 'video' ||
    Boolean(card.stream?.type?.startsWith('video/')) ||
    getNearestTypes(card).includes('VideoObject') ||
    [card.image, previewImage].some((image) => Boolean(image && X_VIDEO_THUMBNAIL.test(image.trim())))
  );
}

/**
 * The one rule for "a post shows from its card's data alone, with nothing to press" (platform embeds up
 * front off): a post the card tells (`getResourcePost`) that carries no video (`hasPostVideo`). Its
 * site's own embed (X's, a Mastodon frame) is then never offered; any other post keeps it.
 */
export function showsPostFromCard(card: TPostCard, previewImage?: string | null): boolean {
  return getResourcePost(card) !== null && !hasPostVideo(card, previewImage);
}

interface ResourcePostProps {
  post: TResourcePost;
  /** The resource page: the text opens it, in a new tab where links may not navigate. */
  href: string;
  linkTarget?: '_blank';
  /** The resource page's card: the whole text as the page's heading; elsewhere a link, at most eight lines. */
  isLarge?: boolean;
}

/**
 * A social post inside its card, from the card's data alone (nothing is asked from the post's site):
 * the author's name and handle, the text as a post's text reads, and the date as a post's header shows
 * it (`PostHeaderTimestamp`). On the resource page the text is the page's heading, not a link. The
 * card's header still names the site and links out to the post.
 */
export function ResourcePost({ post, href, linkTarget, isLarge = false }: ResourcePostProps) {
  const textClass = 'text-base leading-6 font-medium wrap-anywhere whitespace-pre-line text-foreground';
  return (
    <Container overrideDefaults data-testid="resource-card-post" className="flex min-w-0 flex-1 flex-col gap-1.5">
      {post.authorName && (
        <Typography
          as="span"
          overrideDefaults
          dir="auto"
          data-testid="resource-card-post-author"
          className="flex min-w-0 items-baseline gap-1.5"
        >
          <span className="truncate font-bold text-foreground">{post.authorName}</span>
          {post.handle && <span className="truncate text-sm font-medium text-muted-foreground">@{post.handle}</span>}
        </Typography>
      )}
      {isLarge ? (
        // The resource page's heading, not a link: the header's site link is the one way to the post.
        <Typography as="h2" overrideDefaults dir="auto" data-testid="resource-card-title" className={textClass}>
          {post.text}
        </Typography>
      ) : (
        <Link
          href={href}
          target={linkTarget}
          rel={linkTarget ? 'noopener noreferrer' : undefined}
          overrideDefaults
          dir="auto"
          data-testid="resource-card-title"
          className={cn(textClass, 'line-clamp-8')}
        >
          {post.text}
        </Link>
      )}
      {post.date && (
        <Container overrideDefaults data-testid="resource-card-post-date">
          <PostHeaderTimestamp timeAgo={post.date} />
        </Container>
      )}
    </Container>
  );
}
