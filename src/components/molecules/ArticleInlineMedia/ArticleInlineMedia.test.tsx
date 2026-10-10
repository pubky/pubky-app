import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useLocalFilesStore } from '@/stores/localFiles/localFiles.store';
import { ArticleInlineMedia } from './ArticleInlineMedia';
import type { ArticleMediaFile } from './ArticleInlineMedia.types';

vi.mock('@/controllers/file/file', () => ({
  FileController: {
    getFileUrl: vi.fn(({ fileId, variant }: { fileId: string; variant: string }) => `cdn://${fileId}?v=${variant}`),
  },
}));

const AUTHOR = 'o1gg96ewuojmopcjbz8895478wdtxtzzuxnfjjz8o8e77csa1ngo';
const POST_ID = `${AUTHOR}:post1`;
const fileUri = (id: string) => `pubky://${AUTHOR}/pub/pubky.app/files/${id}`;
const attachments = [fileUri('cover'), fileUri('clip'), fileUri('song'), fileUri('paper')];
const files: ArticleMediaFile[] = [
  { uri: fileUri('clip'), content_type: 'video/mp4', name: 'clip.mp4' },
  { uri: fileUri('song'), content_type: 'audio/wav', name: 'song.wav' },
  { uri: fileUri('paper'), content_type: 'application/pdf', name: 'paper.pdf' },
];

const renderMedia = (
  src: string | undefined,
  options?: { alt?: string; files?: ArticleMediaFile[]; metadataSettled?: boolean },
) =>
  render(
    <ArticleInlineMedia
      src={src}
      alt={options?.alt}
      attachments={attachments}
      authorId={AUTHOR}
      postId={POST_ID}
      files={options?.files ?? files}
      metadataSettled={options?.metadataSettled ?? true}
    />,
  );

describe('ArticleInlineMedia', () => {
  beforeEach(() => {
    useLocalFilesStore.setState({ posts: {} });
  });

  it('hands image slots to ArticleInlineImage unchanged', () => {
    renderMedia('attachment:0', { alt: 'Cover' });

    const img = screen.getByTestId('article-inline-image');
    expect(img).toHaveAttribute('src', `cdn://${AUTHOR}:cover?v=main`);
    expect(img).toHaveAttribute('alt', 'Cover');
    expect(img).toHaveAttribute('loading', 'lazy');
  });

  it('renders a video slot as an inline player with metadata preload and no autoplay', () => {
    renderMedia('attachment:1', { alt: 'A clip' });

    const video = screen.getByTestId('article-inline-video');
    expect(video.tagName).toBe('VIDEO');
    expect(video).toHaveAttribute('src', `cdn://${AUTHOR}:clip?v=main`);
    expect(video).toHaveAttribute('controls');
    expect(video).toHaveAttribute('playsinline');
    expect(video).toHaveAttribute('preload', 'metadata');
    expect(video).toHaveAttribute('aria-label', 'A clip');
    expect(video).not.toHaveAttribute('autoplay');
  });

  it('renders an audio slot as an inline player', () => {
    renderMedia('attachment:2');

    const audio = screen.getByTestId('article-inline-audio');
    expect(audio.tagName).toBe('AUDIO');
    expect(audio).toHaveAttribute('src', `cdn://${AUTHOR}:song?v=main`);
    expect(audio).toHaveAttribute('controls');
    expect(audio).toHaveAttribute('preload', 'metadata');
    expect(audio).not.toHaveAttribute('aria-label');
  });

  it('renders a PDF slot as a file card that opens the file in a new tab', () => {
    renderMedia('attachment:3');

    const card = screen.getByTestId('article-inline-file');
    expect(card.tagName).toBe('SPAN');
    expect(card).toHaveTextContent('paper.pdf');
    const link = screen.getByRole('link', { name: 'Open PDF' });
    expect(link).toHaveAttribute('href', `cdn://${AUTHOR}:paper?v=main`);
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('labels the PDF card with the author description when there is one', () => {
    renderMedia('attachment:3', { alt: 'Quarterly report' });

    expect(screen.getByTestId('article-inline-file')).toHaveTextContent('Quarterly report');
  });

  it('reserves space while the slot type is unknown and never requests anything', () => {
    const { container } = renderMedia('attachment:1', { files: [], metadataSettled: false });

    expect(screen.getByTestId('article-inline-media-loading')).toBeInTheDocument();
    expect(container.querySelector('img, video, audio')).not.toBeInTheDocument();
  });

  it('shows a placeholder for a type it cannot play, without requesting the file', () => {
    const { container } = renderMedia('attachment:1', {
      files: [{ uri: fileUri('clip'), content_type: 'application/zip', name: 'archive.zip' }],
    });

    expect(screen.getByTestId('article-inline-media-fallback')).toHaveAttribute('aria-label', 'File unavailable');
    expect(container.querySelector('img, video, audio, a')).not.toBeInTheDocument();
  });

  it('falls back to the image path once the metadata read settled without a row', () => {
    renderMedia('attachment:1', { files: [], metadataSettled: true });

    expect(screen.getByTestId('article-inline-image')).toHaveAttribute('src', `cdn://${AUTHOR}:clip?v=main`);
  });

  it('plays a same-session upload from its object URL before any metadata exists', () => {
    useLocalFilesStore.setState({
      posts: {
        [POST_ID]: [
          { type: 'image/png', name: 'cover.png', urls: { main: 'blob:cover' } },
          { type: 'video/mp4', name: 'fresh.mp4', urls: { main: 'blob:fresh' } },
          { type: 'audio/wav', name: 'fresh.wav', urls: { main: 'blob:wav' } },
          { type: 'application/pdf', name: 'fresh.pdf', urls: { main: 'blob:pdf' } },
        ],
      },
    });

    renderMedia('attachment:1', { files: [], metadataSettled: false });

    expect(screen.getByTestId('article-inline-video')).toHaveAttribute('src', 'blob:fresh');
  });

  it('renders the players of unlocked content from the bytes the reader holds', () => {
    render(
      <ArticleInlineMedia
        src="attachment:1"
        alt="Clip"
        localAttachments={[
          { type: 'image/png', name: 'attachment-0', urls: { main: 'blob:cover' }, slot: 0 },
          { type: 'video/mp4', name: 'attachment-1', urls: { main: 'blob:clip' }, slot: 1 },
        ]}
      />,
    );

    expect(screen.getByTestId('article-inline-video')).toHaveAttribute('src', 'blob:clip');
  });

  it('never turns a foreign pubky URI into a player', () => {
    renderMedia('pubky://zzzz96ewuojmopcjbz8895478wdtxtzzuxnfjjz8o8e77csa1ngo/pub/pubky.app/files/clip');

    expect(screen.queryByTestId('article-inline-video')).not.toBeInTheDocument();
    expect(screen.getByTestId('article-inline-image')).toBeInTheDocument();
  });

  it('plays an external video link without preloading from the third-party host', () => {
    renderMedia('https://example.com/clip.mp4');

    const video = screen.getByTestId('article-inline-video');
    expect(video).toHaveAttribute('src', 'https://example.com/clip.mp4');
    expect(video).toHaveAttribute('preload', 'none');
  });

  it('opens an external PDF card through the reader link handler, a CDN slot directly', () => {
    const onLinkClick = vi.fn();
    const { rerender } = render(
      <ArticleInlineMedia
        src="https://example.com/paper.pdf"
        alt="Report"
        attachments={attachments}
        authorId={AUTHOR}
        postId={POST_ID}
        files={files}
        metadataSettled
        onLinkClick={onLinkClick}
      />,
    );

    fireEvent.click(screen.getByRole('link', { name: 'Open PDF' }));
    expect(onLinkClick).toHaveBeenCalledTimes(1);
    expect(onLinkClick).toHaveBeenCalledWith('https://example.com/paper.pdf', expect.anything());

    // The author's own file on the CDN is not an external destination
    rerender(
      <ArticleInlineMedia
        src="attachment:3"
        attachments={attachments}
        authorId={AUTHOR}
        postId={POST_ID}
        files={files}
        metadataSettled
        onLinkClick={onLinkClick}
      />,
    );
    fireEvent.click(screen.getByRole('link', { name: 'Open PDF' }));
    expect(onLinkClick).toHaveBeenCalledTimes(1);
  });

  it('keeps external images on the image path', () => {
    renderMedia('https://example.com/pic.png');

    expect(screen.getByTestId('article-inline-image')).toHaveAttribute('src', 'https://example.com/pic.png');
  });

  it('degrades a player that fails to load to a placeholder, labelled by alt or a generic text', () => {
    renderMedia('attachment:1', { alt: 'Launch clip' });
    fireEvent.error(screen.getByTestId('article-inline-video'));
    expect(screen.getByTestId('article-inline-media-fallback')).toHaveTextContent('Launch clip');
    expect(screen.queryByTestId('article-inline-video')).not.toBeInTheDocument();

    renderMedia('attachment:2');
    fireEvent.error(screen.getByTestId('article-inline-audio'));
    expect(screen.getAllByTestId('article-inline-media-fallback')[1]).toHaveTextContent('Audio unavailable');
  });

  it('pauses only the player the reader scrolled past', () => {
    type IntersectionCallback = (entries: IntersectionObserverEntry[]) => void;
    const observed: { callback: IntersectionCallback; target: Element }[] = [];
    class MockIntersectionObserver {
      constructor(private readonly callback: IntersectionCallback) {}
      observe = (target: Element) => {
        observed.push({ callback: this.callback, target });
      };
      disconnect = vi.fn();
      unobserve = vi.fn();
      takeRecords = vi.fn(() => []);
      root = null;
      rootMargin = '0px';
      thresholds = [0];
    }
    vi.stubGlobal('IntersectionObserver', MockIntersectionObserver);
    const pause = vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined);

    render(
      <>
        <ArticleInlineMedia
          src="attachment:1"
          attachments={attachments}
          authorId={AUTHOR}
          postId={POST_ID}
          files={files}
          metadataSettled
        />
        <ArticleInlineMedia
          src="attachment:2"
          attachments={attachments}
          authorId={AUTHOR}
          postId={POST_ID}
          files={files}
          metadataSettled
        />
      </>,
    );
    const video = screen.getByTestId('article-inline-video');
    const audio = screen.getByTestId('article-inline-audio');
    // One observer per player, each watching the element around its own media
    expect(observed).toHaveLength(2);
    const videoObserver = observed.find(({ target }) => target.contains(video));
    expect(videoObserver?.target.contains(audio)).toBe(false);

    videoObserver?.callback([{ isIntersecting: false } as IntersectionObserverEntry]);

    expect(pause).toHaveBeenCalledTimes(1);
    expect(pause.mock.contexts).toEqual([video]);
    vi.unstubAllGlobals();
  });

  it('retries a failed player when its source changes', () => {
    const { rerender } = renderMedia('attachment:1');
    fireEvent.error(screen.getByTestId('article-inline-video'));
    expect(screen.getByTestId('article-inline-media-fallback')).toBeInTheDocument();

    rerender(
      <ArticleInlineMedia
        src="attachment:2"
        attachments={attachments}
        authorId={AUTHOR}
        postId={POST_ID}
        files={files}
        metadataSettled
      />,
    );

    expect(screen.getByTestId('article-inline-audio')).toBeInTheDocument();
    expect(screen.queryByTestId('article-inline-media-fallback')).not.toBeInTheDocument();
  });
});
