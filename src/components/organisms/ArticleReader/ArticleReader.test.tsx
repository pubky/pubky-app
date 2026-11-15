import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { usePostArticle } from '@/hooks/usePostArticle/usePostArticle';
import { FileVariant } from '@/services/nexus/file/file.types';
import type { AttachmentConstructed, PendingAttachment } from '../PostAttachments/PostAttachments.types';
import { ArticleReader } from './ArticleReader';

/**
 * An unlocked article read in full, through the real cover rule, text and image components: the body
 * decides where each image goes, and the attachment slots decide which image it is.
 */

vi.mock('next/navigation', () => ({
  usePathname: () => '/post/author/post1',
  useRouter: () => ({ push: vi.fn() }),
}));

/** Wired the way the article page and the profile's full read wire it. */
function UnlockedArticle({
  content,
  media,
  pending = [],
  priority,
}: {
  content: string;
  media: AttachmentConstructed[];
  pending?: PendingAttachment[];
  priority?: boolean;
}) {
  const { body, coverImage, isCoverPending } = usePostArticle({
    content,
    attachments: null,
    localAttachments: media,
    pendingAttachments: pending,
    coverImageVariant: FileVariant.FEED,
  });
  return (
    <ArticleReader
      body={body}
      coverImage={coverImage}
      isCoverPending={isCoverPending}
      articleMedia={{ localAttachments: media, pendingAttachments: pending }}
      priority={priority}
    />
  );
}

const media = (name: string, slot: number): AttachmentConstructed => ({
  type: 'image/png',
  name,
  urls: { main: `blob:${name}`, feed: `blob:${name}` },
  slot,
});

const article = (body: string) => JSON.stringify({ title: 'Locked essay', body });

const BODY = [
  'First paragraph',
  '![one](attachment:1)',
  'Second paragraph',
  '![two](attachment:2)',
  'Last paragraph',
].join('\n\n');

const IMAGE = '[data-testid="article-inline-image"]';
const PLACEHOLDER = '[data-testid="article-inline-image-fallback"]';

/** Body paragraphs and images, in the order the reader sees them. A placeholder reads as its alt text. */
const readingOrder = (container: HTMLElement) =>
  [...container.querySelectorAll(`[data-cy="post-text"] :is(p, ${IMAGE}, ${PLACEHOLDER})`)]
    // Markdown wraps an image in its own paragraph; the image inside is what counts.
    .filter((node) => !node.querySelector(`${IMAGE}, ${PLACEHOLDER}`))
    .map((node) => (node instanceof HTMLImageElement ? node.getAttribute('src') : node.textContent?.trim()));

describe('ArticleReader - unlocked article', () => {
  it('shows each image where the author placed it, between the paragraphs', () => {
    const { container } = render(
      <UnlockedArticle content={article(BODY)} media={[media('cover', 0), media('one', 1), media('two', 2)]} />,
    );

    expect(readingOrder(container)).toEqual([
      'First paragraph',
      'blob:one',
      'Second paragraph',
      'blob:two',
      'Last paragraph',
    ]);
  });

  it('keeps the cover out of the body and shows it once, above the body', () => {
    const { container } = render(
      <UnlockedArticle content={article(BODY)} media={[media('cover', 0), media('one', 1), media('two', 2)]} />,
    );

    expect(screen.getAllByRole('img').filter((img) => img.getAttribute('src') === 'blob:cover')).toHaveLength(1);
    expect(container.firstElementChild).toBe(container.querySelector('picture'));
  });

  it('leaves a lost image as a placeholder in its place, without moving the others', () => {
    const { container } = render(
      // Slot 1 could not be copied: the image of slot 2 is now second in the list.
      <UnlockedArticle content={article(BODY)} media={[media('cover', 0), media('two', 2)]} />,
    );

    expect(readingOrder(container)).toEqual([
      'First paragraph',
      'one',
      'Second paragraph',
      'blob:two',
      'Last paragraph',
    ]);
  });

  it('starts the body images at slot 0 when the article has no cover', () => {
    const { container } = render(
      <UnlockedArticle content={article('Intro\n\n![first](attachment:0)\n\nOutro')} media={[media('first', 0)]} />,
    );

    expect(readingOrder(container)).toEqual(['Intro', 'blob:first', 'Outro']);
    // Slot 0 is a body image here, so nothing is a cover.
    expect(screen.getAllByRole('img')).toHaveLength(1);
  });

  const pending = (type: string, slot: number) => ({ slot, type });

  // #2757: the text is on screen while the reader's copy of the images still downloads.
  it('holds a skeleton for the cover and each body image while the bytes download', () => {
    const { container } = render(
      <UnlockedArticle
        content={article(BODY)}
        media={[]}
        pending={[pending('image/png', 0), pending('image/png', 1), pending('image/png', 2)]}
      />,
    );

    expect(screen.getByText('First paragraph')).toBeInTheDocument();
    expect(container.querySelectorAll('[data-slot="skeleton"]')).toHaveLength(1); // the cover
    expect(container.querySelectorAll('[data-testid="article-inline-image-loading"]')).toHaveLength(2);
    expect(container.querySelector(PLACEHOLDER)).not.toBeInTheDocument();
  });

  // A video in slot 0 never becomes a cover, so a skeleton there would only appear and vanish.
  it('holds no cover box while a video in slot 0 downloads', () => {
    const { container } = render(
      <UnlockedArticle
        content={article(BODY)}
        media={[]}
        pending={[pending('video/mp4', 0), pending('image/png', 1), pending('image/png', 2)]}
      />,
    );

    expect(container.querySelector('[data-slot="skeleton"]')).not.toBeInTheDocument();
    expect(container.querySelectorAll('[data-testid="article-inline-image-loading"]')).toHaveLength(2);
  });

  it('fetches the cover eagerly at high priority only when the caller marks it as the page hero', () => {
    const cover = () => screen.getByRole('img', { name: 'cover' });
    const { unmount } = render(<UnlockedArticle content={article(BODY)} media={[media('cover', 0)]} />);
    expect(cover()).not.toHaveAttribute('loading');
    expect(cover()).not.toHaveAttribute('fetchpriority');
    unmount();

    render(<UnlockedArticle content={article(BODY)} media={[media('cover', 0)]} priority />);
    expect(cover()).toHaveAttribute('loading', 'eager');
    expect(cover()).toHaveAttribute('fetchpriority', 'high');
  });
});
