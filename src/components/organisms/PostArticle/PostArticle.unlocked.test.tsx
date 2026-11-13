import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { AttachmentConstructed } from '../PostAttachments/PostAttachments.types';
import { PostArticle } from './PostArticle';

/** The preview card of an unlocked article, through the real cover rule, text and image components. */

vi.mock('next/navigation', () => ({
  usePathname: () => '/home',
  useRouter: () => ({ push: vi.fn() }),
}));

const media = (name: string, slot: number): AttachmentConstructed => ({
  type: 'image/png',
  name,
  urls: { main: `blob:${name}`, feed: `blob:${name}` },
  slot,
});

const content = JSON.stringify({
  title: 'Locked essay',
  body: 'First paragraph\n\n![one](attachment:1)\n\nLast paragraph',
});

describe('PostArticle - unlocked article preview', () => {
  it('holds the cover box while the bytes download', () => {
    const { container } = render(
      <PostArticle
        content={content}
        attachments={null}
        localAttachments={[]}
        pendingAttachments={[
          { slot: 0, type: 'image/png' },
          { slot: 1, type: 'image/png' },
        ]}
      />,
    );

    expect(container.querySelectorAll('[data-slot="skeleton"]')).toHaveLength(1);
    expect(container.querySelector('[data-testid="article-inline-image-loading"]')).not.toBeInTheDocument();
  });

  it('shows the cover from slot 0 and no body image', () => {
    const { container } = render(
      <PostArticle content={content} attachments={null} localAttachments={[media('one', 1), media('cover', 0)]} />,
    );

    expect(container.querySelector('img')).toHaveAttribute('src', 'blob:cover');
    expect(container.querySelector('[data-testid="article-inline-image"]')).not.toBeInTheDocument();
  });
});
