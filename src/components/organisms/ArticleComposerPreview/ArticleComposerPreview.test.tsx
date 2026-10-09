import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PostTextProps } from '@/molecules/PostText/PostText.types';
import type { NexusUserDetails } from '@/services/nexus/nexus.types';
import type { PostHeaderProps } from '../PostHeader/PostHeader.types';
import { ArticleComposerPreview } from './ArticleComposerPreview';

const AUTHOR = 'o1gg96ewuojmopcjbz8895478wdtxtzzuxnfjjz8o8e77csa1ngo';
const FILE_URI = `pubky://${AUTHOR}/pub/pubky.app/files/0033SR8XHZ4Q0`;
const CLIP_URI = `pubky://${AUTHOR}/pub/pubky.app/files/0033SR8XHZ4Q1`;

vi.mock('@/molecules/PostText/PostText', () => ({
  PostText: vi.fn((props: PostTextProps) => (
    <div
      data-testid="post-text"
      data-content={props.content}
      data-is-article={props.isArticle}
      data-full-article={props.fullArticle}
      data-local-attachments={JSON.stringify(
        props.articleMedia && 'localAttachments' in props.articleMedia ? props.articleMedia.localAttachments : null,
      )}
      className={props.className}
    />
  )),
}));

vi.mock('../PostHeader/PostHeader', () => ({
  PostHeader: vi.fn((props: PostHeaderProps) => (
    <div
      data-testid="post-header"
      data-post-id={props.postId}
      data-reply-input={props.isReplyInput}
      data-size={props.size}
      data-user-name={props.userDetails?.name}
    />
  )),
}));

vi.mock('@/atoms/Image/Image', () => ({
  Image: ({
    src,
    alt,
    className,
    'data-testid': testId,
  }: {
    src: string;
    alt: string;
    className?: string;
    'data-testid'?: string;
  }) => <img data-testid={testId ?? 'image'} src={src} alt={alt} className={className} />,
}));

const userDetails = { id: AUTHOR, name: 'Satoshi Nakamoto' } as NexusUserDetails;

const inlineMedia = {
  getPreviewUrl: vi.fn((uri: string) => (uri === FILE_URI ? 'blob:preview-image' : null)),
  getMediaType: vi.fn((uri: string) => (uri === FILE_URI ? 'image/png' : uri === CLIP_URI ? 'video/mp4' : null)),
  getMediaName: vi.fn((uri: string) => (uri === FILE_URI ? 'diagram.png' : uri === CLIP_URI ? 'clip.mp4' : null)),
};

const createObjectURL = vi.fn(() => 'blob:cover');
const revokeObjectURL = vi.fn();

function readLocalAttachments() {
  return JSON.parse(screen.getByTestId('post-text').getAttribute('data-local-attachments') ?? 'null');
}

describe('ArticleComposerPreview', () => {
  beforeEach(() => {
    global.URL.createObjectURL = createObjectURL;
    global.URL.revokeObjectURL = revokeObjectURL;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('renders the title, the author byline and the body through the published article path', () => {
    render(
      <ArticleComposerPreview
        title="Lightning: From Reckless to Reliable"
        body="Plain paragraph."
        authorPubky={AUTHOR}
        userDetails={userDetails}
        inlineMedia={inlineMedia}
      />,
    );

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Lightning: From Reckless to Reliable');
    const header = screen.getByTestId('post-header');
    expect(header).toHaveAttribute('data-post-id', AUTHOR);
    expect(header).toHaveAttribute('data-reply-input', 'true');
    expect(header).toHaveAttribute('data-size', 'extraLarge');
    expect(header).toHaveAttribute('data-user-name', 'Satoshi Nakamoto');
    const text = screen.getByTestId('post-text');
    expect(text).toHaveAttribute('data-content', 'Plain paragraph.');
    expect(text).toHaveAttribute('data-is-article', 'true');
    expect(text).toHaveAttribute('data-full-article', 'true');
    expect(text).toHaveClass('[&_a]:pointer-events-none');
  });

  it('serializes inline media to attachment slots and feeds them the session entries', () => {
    render(
      <ArticleComposerPreview
        title="T"
        body={`Intro\n\n![Diagram](${FILE_URI})\n\n![](${CLIP_URI})`}
        authorPubky={AUTHOR}
        inlineMedia={inlineMedia}
      />,
    );

    expect(screen.getByTestId('post-text')).toHaveAttribute(
      'data-content',
      'Intro\n\n![Diagram](attachment:0)\n\n![](attachment:1)',
    );
    expect(readLocalAttachments()).toEqual([
      { type: 'image/png', name: 'diagram.png', urls: { main: 'blob:preview-image' } },
      { type: 'video/mp4', name: 'clip.mp4', urls: { main: expect.stringContaining('0033SR8XHZ4Q1') } },
    ]);
  });

  it('puts a cover picked this session in slot 0 and numbers inline media after it', () => {
    const coverFile = new File(['cover'], 'cover.jpg', { type: 'image/jpeg' });

    render(
      <ArticleComposerPreview
        title="T"
        body={`![](${FILE_URI})`}
        authorPubky={AUTHOR}
        coverFile={coverFile}
        inlineMedia={inlineMedia}
      />,
    );

    expect(createObjectURL).toHaveBeenCalledWith(coverFile);
    const cover = screen.getByTestId('article-composer-preview-cover');
    expect(cover).toHaveAttribute('src', 'blob:cover');
    expect(cover).toHaveAttribute('alt', 'cover.jpg');
    expect(screen.getByTestId('post-text')).toHaveAttribute('data-content', '![](attachment:1)');
    expect(readLocalAttachments()).toEqual([
      { type: 'image/jpeg', name: 'cover.jpg', urls: { main: 'blob:cover' } },
      { type: 'image/png', name: 'diagram.png', urls: { main: 'blob:preview-image' } },
    ]);
  });

  it('renders a kept cover from the published article when no new one was picked', () => {
    render(
      <ArticleComposerPreview
        title="T"
        body="Body"
        authorPubky={AUTHOR}
        coverAttachment={{ src: 'https://cdn.example/cover', alt: 'Old cover', type: 'image/webp' }}
        inlineMedia={inlineMedia}
      />,
    );

    expect(screen.getByTestId('article-composer-preview-cover')).toHaveAttribute('src', 'https://cdn.example/cover');
    expect(readLocalAttachments()).toEqual([
      { type: 'image/webp', name: 'Old cover', urls: { main: 'https://cdn.example/cover' } },
    ]);
  });

  it('revokes the cover object URL on unmount', () => {
    const { unmount } = render(
      <ArticleComposerPreview
        title="T"
        body="Body"
        authorPubky={AUTHOR}
        coverFile={new File(['cover'], 'cover.jpg', { type: 'image/jpeg' })}
        inlineMedia={inlineMedia}
      />,
    );

    unmount();

    expect(revokeObjectURL).toHaveBeenCalledWith('blob:cover');
  });

  it('previews a body the publish would refuse as written', () => {
    render(
      <ArticleComposerPreview
        title="T"
        body="![hand typed](attachment:3)"
        authorPubky={AUTHOR}
        inlineMedia={inlineMedia}
      />,
    );

    expect(screen.getByTestId('post-text')).toHaveAttribute('data-content', '![hand typed](attachment:3)');
    expect(readLocalAttachments()).toEqual([]);
  });

  it('shows placeholders for an empty title and body', () => {
    render(<ArticleComposerPreview title="   " body="  " authorPubky={AUTHOR} inlineMedia={inlineMedia} />);

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Untitled article');
    expect(screen.getByRole('heading', { level: 1 })).toHaveClass('text-muted-foreground');
    expect(screen.getByText('Nothing to preview yet.')).toBeInTheDocument();
    expect(screen.queryByTestId('post-text')).not.toBeInTheDocument();
  });
});

describe('ArticleComposerPreview - Snapshots', () => {
  beforeEach(() => {
    global.URL.createObjectURL = createObjectURL;
    global.URL.revokeObjectURL = revokeObjectURL;
  });

  it('matches snapshot with a title and body', () => {
    const { container } = render(
      <ArticleComposerPreview
        title="Snapshot title"
        body="Snapshot body"
        authorPubky={AUTHOR}
        userDetails={userDetails}
        inlineMedia={inlineMedia}
      />,
    );
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with a cover and an empty body', () => {
    const { container } = render(
      <ArticleComposerPreview
        title="Snapshot title"
        body=""
        authorPubky={AUTHOR}
        coverFile={new File(['cover'], 'cover.jpg', { type: 'image/jpeg' })}
        inlineMedia={inlineMedia}
      />,
    );
    expect(container.firstChild).toMatchSnapshot();
  });
});
