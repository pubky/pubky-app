import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useLocalFilesStore } from '@/stores/localFiles/localFiles.store';
import { ArticleInlineImage } from './ArticleInlineImage';

vi.mock('@/controllers/file/file', () => ({
  FileController: {
    getFileUrl: vi.fn(({ fileId, variant }: { fileId: string; variant: string }) => `cdn://${fileId}?v=${variant}`),
  },
}));

const AUTHOR = 'o1gg96ewuojmopcjbz8895478wdtxtzzuxnfjjz8o8e77csa1ngo';
const POST_ID = `${AUTHOR}:post1`;
const fileUri = (id: string) => `pubky://${AUTHOR}/pub/pubky.app/files/${id}`;

const renderImage = (src: string | undefined, options?: { alt?: string; attachments?: string[] }) =>
  render(
    <ArticleInlineImage
      src={src}
      alt={options?.alt}
      attachments={options?.attachments ?? [fileUri('cover'), fileUri('inline')]}
      authorId={AUTHOR}
      postId={POST_ID}
    />,
  );

describe('ArticleInlineImage', () => {
  beforeEach(() => {
    useLocalFilesStore.setState({ posts: {} });
  });

  it('renders attachment references via the CDN with lazy loading and no referrer', () => {
    renderImage('attachment:1', { alt: 'My picture' });

    const img = screen.getByTestId('article-inline-image');
    expect(img).toHaveAttribute('src', `cdn://${AUTHOR}:inline?v=main`);
    expect(img).toHaveAttribute('alt', 'My picture');
    expect(img).toHaveAttribute('loading', 'lazy');
    expect(img).toHaveAttribute('referrerpolicy', 'no-referrer');
  });

  it('prefers the same-session local store entry for attachment references', () => {
    useLocalFilesStore.setState({
      posts: {
        [POST_ID]: [
          { type: 'image/png', name: 'cover.png', urls: { main: 'blob:local-cover' } },
          { type: 'image/png', name: 'inline.png', urls: { main: 'blob:local-inline' } },
        ],
      },
    });

    renderImage('attachment:1');

    expect(screen.getByTestId('article-inline-image')).toHaveAttribute('src', 'blob:local-inline');
  });

  it('renders external https images directly', () => {
    renderImage('https://example.com/pic.png');

    expect(screen.getByTestId('article-inline-image')).toHaveAttribute('src', 'https://example.com/pic.png');
  });

  it('renders a placeholder for invalid destinations without a network request', () => {
    for (const src of ['attachment:9', 'attachment:01', 'http://example.com/pic.png', 'data:image/png;base64,AAAA']) {
      const { unmount } = renderImage(src, { alt: 'Broken' });

      expect(screen.getByTestId('article-inline-image-fallback')).toHaveTextContent('Broken');
      expect(screen.queryByTestId('article-inline-image')).not.toBeInTheDocument();
      unmount();
    }
  });

  it('uses a generic label when the alt text is empty', () => {
    renderImage('attachment:9');

    expect(screen.getByTestId('article-inline-image-fallback')).toHaveTextContent('Image unavailable');
  });

  it('falls back to the placeholder when the image fails to load', () => {
    renderImage('attachment:1', { alt: 'My picture' });

    fireEvent.error(screen.getByTestId('article-inline-image'));

    expect(screen.queryByTestId('article-inline-image')).not.toBeInTheDocument();
    expect(screen.queryByTestId('article-inline-image-loading')).not.toBeInTheDocument();
    expect(screen.getByTestId('article-inline-image-fallback')).toHaveTextContent('My picture');
  });

  it('shows a loading skeleton until the image loads', () => {
    renderImage('attachment:1');

    expect(screen.getByTestId('article-inline-image-loading')).toBeInTheDocument();

    fireEvent.load(screen.getByTestId('article-inline-image'));

    expect(screen.queryByTestId('article-inline-image-loading')).not.toBeInTheDocument();
    expect(screen.getByTestId('article-inline-image')).toBeInTheDocument();
  });

  it('never shows a loading skeleton for invalid destinations', () => {
    renderImage('attachment:9');

    expect(screen.queryByTestId('article-inline-image-loading')).not.toBeInTheDocument();
    expect(screen.getByTestId('article-inline-image-fallback')).toBeInTheDocument();
  });
});
