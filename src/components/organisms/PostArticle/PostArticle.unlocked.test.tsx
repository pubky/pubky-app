import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { AttachmentConstructed } from '../PostAttachments/PostAttachments.types';
import { PostArticle } from './PostArticle';

/**
 * An unlocked article, rendered through the real text and image components: the body decides where
 * each image goes, and the attachment slots decide which image it is.
 */

vi.mock('next/navigation', () => ({
  usePathname: () => '/post/author/post1',
  useRouter: () => ({ push: vi.fn() }),
}));

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

describe('PostArticle - unlocked article body images', () => {
  it('shows each image where the author placed it, between the paragraphs', () => {
    const { container } = render(
      <PostArticle
        content={article(BODY)}
        attachments={null}
        localAttachments={[media('cover', 0), media('one', 1), media('two', 2)]}
        variant="full"
      />,
    );

    expect(readingOrder(container)).toEqual([
      'First paragraph',
      'blob:one',
      'Second paragraph',
      'blob:two',
      'Last paragraph',
    ]);
  });

  it('keeps the cover out of the body and shows it once, above the title', () => {
    render(
      <PostArticle
        content={article(BODY)}
        attachments={null}
        localAttachments={[media('cover', 0), media('one', 1), media('two', 2)]}
        variant="full"
      />,
    );

    expect(screen.getAllByRole('img').filter((img) => img.getAttribute('src') === 'blob:cover')).toHaveLength(1);
  });

  it('leaves a lost image as a placeholder in its place, without moving the others', () => {
    const { container } = render(
      <PostArticle
        content={article(BODY)}
        attachments={null}
        // Slot 1 could not be copied: the image of slot 2 is now second in the list.
        localAttachments={[media('cover', 0), media('two', 2)]}
        variant="full"
      />,
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
      <PostArticle
        content={article('Intro\n\n![first](attachment:0)\n\nOutro')}
        attachments={null}
        localAttachments={[media('first', 0)]}
        variant="full"
      />,
    );

    expect(readingOrder(container)).toEqual(['Intro', 'blob:first', 'Outro']);
    // Slot 0 is a body image here, so nothing is a cover.
    expect(screen.getAllByRole('img')).toHaveLength(1);
  });

  const pending = (type: string, slot: number) => ({ slot, type });
  const PENDING_IMAGES = [pending('image/png', 0), pending('image/png', 1), pending('image/png', 2)];

  // #2757: the text is on screen while the reader's copy of the images still downloads.
  it('holds a skeleton for the cover and each body image while the bytes download', () => {
    const { container } = render(
      <PostArticle
        content={article(BODY)}
        attachments={null}
        localAttachments={[]}
        variant="full"
        pendingAttachments={PENDING_IMAGES}
      />,
    );

    expect(screen.getByText('First paragraph')).toBeInTheDocument();
    expect(container.querySelectorAll('[data-slot="skeleton"]')).toHaveLength(1); // the cover
    expect(container.querySelectorAll('[data-testid="article-inline-image-loading"]')).toHaveLength(2);
    expect(container.querySelector(PLACEHOLDER)).not.toBeInTheDocument();
  });

  it('holds the cover box in the preview card while the bytes download', () => {
    const { container } = render(
      <PostArticle
        content={article(BODY)}
        attachments={null}
        localAttachments={[]}
        pendingAttachments={PENDING_IMAGES}
      />,
    );

    expect(container.querySelectorAll('[data-slot="skeleton"]')).toHaveLength(1);
    expect(container.querySelector('[data-testid="article-inline-image-loading"]')).not.toBeInTheDocument();
  });

  // A video in slot 0 never becomes a cover, so a skeleton there would only appear and vanish.
  it('holds no cover box while a video in slot 0 downloads', () => {
    const { container } = render(
      <PostArticle
        content={article(BODY)}
        attachments={null}
        localAttachments={[]}
        variant="full"
        pendingAttachments={[pending('video/mp4', 0), pending('image/png', 1), pending('image/png', 2)]}
      />,
    );

    expect(container.querySelector('[data-slot="skeleton"]')).not.toBeInTheDocument();
    expect(container.querySelectorAll('[data-testid="article-inline-image-loading"]')).toHaveLength(2);
  });

  it('shows no body image in the preview card', () => {
    const { container } = render(
      <PostArticle
        content={article(BODY)}
        attachments={null}
        localAttachments={[media('cover', 0), media('one', 1), media('two', 2)]}
      />,
    );

    expect(container.querySelector('[data-testid="article-inline-image"]')).not.toBeInTheDocument();
  });
});
