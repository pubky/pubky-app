import { matchPostRoute, matchProfileRoute, matchSingleCollectionRoute } from '@/app/routes';
import { parseArticleContent } from '@/libs/post/articleContent';
import { parseCollectionContent } from '@/libs/post/collectionContent';
import { truncateByGraphemes } from '@/libs/utils/truncate';
import { isPostDeleted, isUserDeleted, resolveUserDisplayName } from '@/libs/utils/utils';
import { buildCompositeId } from '@/models/models.utils';
import type {
  ContextualBannerCopy,
  ContextualBannerCopyInput,
  ContextualBannerTarget,
} from './useContextualBanner.types';

/** Longest display name the copy interpolates, in grapheme clusters. */
const MAX_NAME_GRAPHEMES = 32;
/** Longest article title or collection name the copy interpolates, in grapheme clusters. */
const MAX_TITLE_GRAPHEMES = 64;

/** Shown while the page's data is not in the local database, and for content the copy must not describe. */
export const GENERIC_CONTEXTUAL_BANNER_COPY: ContextualBannerCopy = {
  headline: 'Join the conversation',
  body: 'Join Pubky to discover conversations and follow people and topics you care about.',
};

/**
 * The shared content behind a pathname: a single post (articles, videos and replies included), a single
 * collection, or another user's profile. `null` for every other route. Pure.
 */
export function getContextualBannerTarget(pathname: string): ContextualBannerTarget | null {
  const post = matchPostRoute(pathname);
  if (post) {
    return {
      kind: 'post',
      compositeId: buildCompositeId({ pubky: post.userId, id: post.postId }),
      authorId: post.userId,
    };
  }
  const collection = matchSingleCollectionRoute(pathname);
  if (collection) {
    return { kind: 'collection', compositeId: buildCompositeId({ pubky: collection.userId, id: collection.postId }) };
  }
  const profile = matchProfileRoute(pathname);
  if (profile) {
    return { kind: 'profile', pubky: profile.pubky };
  }
  return null;
}

/** User text the copy interpolates: trimmed and bounded, or `''` when there is nothing to show. */
function boundText(value: string | null | undefined, max: number): string {
  const text = value?.trim() ?? '';
  return text ? truncateByGraphemes(text, max) : '';
}

function displayName(user: ContextualBannerCopyInput['user']): string {
  if (!user || isUserDeleted(user)) return '';
  return boundText(resolveUserDisplayName(user), MAX_NAME_GRAPHEMES);
}

/**
 * Template copy for the guest contextual banner, from the rows the page already loaded. Names and
 * titles are bounded here; the banner renders them as plain text. Deleted, moderated or missing
 * content gets the generic copy, never a half-filled template. Pure.
 */
export function buildContextualBannerCopy({ target, post, user }: ContextualBannerCopyInput): ContextualBannerCopy {
  if (target === 'profile') {
    const name = displayName(user);
    if (!name) return GENERIC_CONTEXTUAL_BANNER_COPY;
    return {
      headline: `Get to know ${name}`,
      body: `Join Pubky to follow ${name} and take part in the conversation.`,
    };
  }

  if (!post || isPostDeleted(post) || post.is_blurred) return GENERIC_CONTEXTUAL_BANNER_COPY;

  if (post.kind === 'collection') {
    const collectionName = boundText(parseCollectionContent(post.content)?.name, MAX_TITLE_GRAPHEMES);
    if (!collectionName) return GENERIC_CONTEXTUAL_BANNER_COPY;
    return {
      headline: `Interested in ${collectionName}?`,
      body: 'Join Pubky to follow this collection and discover more about this topic.',
    };
  }
  if (target === 'collection') return GENERIC_CONTEXTUAL_BANNER_COPY;

  const name = displayName(user);
  if (!name) return GENERIC_CONTEXTUAL_BANNER_COPY;

  // A lock announcement's `kind` is its teaser's type, so the lock check comes before the kind checks.
  if (post.lock) {
    return {
      headline: "Want to see what's inside?",
      body: `Join Pubky to unlock posts from ${name} and stay up to date.`,
    };
  }
  if (post.kind === 'long') {
    const title = boundText(parseArticleContent(post.content)?.title, MAX_TITLE_GRAPHEMES);
    if (title) {
      return {
        headline: `Enjoying “${title}”?`,
        body: `Join Pubky to reply to ${name}, tag this article, and discover more great writing.`,
      };
    }
  }
  if (post.kind === 'video') {
    return {
      headline: 'Enjoying this video?',
      body: `Join Pubky to reply to ${name}, tag this video, and discover more posts.`,
    };
  }
  return {
    headline: 'Join the conversation',
    body: `Join Pubky to reply to ${name}, tag this post, and share your perspective.`,
  };
}
