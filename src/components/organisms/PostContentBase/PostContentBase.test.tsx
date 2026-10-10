import * as React from 'react';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { EnrichedPostDetails } from '@/application/moderation/moderation.types';
import { usePostDetails } from '@/hooks/usePostDetails/usePostDetails';
import { PostText } from '@/molecules/PostText/PostText';
import { useLocalFilesStore } from '@/stores/localFiles/localFiles.store';
import { PostArticle } from '../PostArticle/PostArticle';
import { PostAttachments } from '../PostAttachments/PostAttachments';
import { PostContentBlurred } from '../PostContentBlurred/PostContentBlurred';
import { PostContentBase } from './PostContentBase';

// Mock next/navigation for usePathname used by PostText
vi.mock('next/navigation', () => ({
  usePathname: vi.fn(() => '/'),
}));

// Mock hooks used by PostContentBase
vi.mock('@/hooks/usePostDetails/usePostDetails', () => ({
  usePostDetails: vi.fn(),
}));

// Mock local files store
vi.mock('@/stores/localFiles/localFiles.store', () => ({
  useLocalFilesStore: vi.fn(),
}));

// Mock atoms
vi.mock('@/atoms/Button/Button', () => {
  return {
    Button: ({
      children,
      className,
      overrideDefaults: _overrideDefaults,
      ...props
    }: {
      children: React.ReactNode;
      className?: string;
      overrideDefaults?: boolean;
      [key: string]: unknown;
    }) => (
      <button data-testid="button" className={className} {...props}>
        {children}
      </button>
    ),
  };
});

vi.mock('@/atoms/Container/Container', () => {
  return {
    Container: ({ children, className }: { children: React.ReactNode; className?: string }) => (
      <div data-testid="container" className={className}>
        {children}
      </div>
    ),
  };
});

vi.mock('@/atoms/Skeleton/Skeleton', () => {
  return {
    Skeleton: ({ className }: { className?: string }) => <div data-testid="skeleton" className={className} />,
  };
});

// Mock molecules - PostText, PostLinkEmbeds
vi.mock('@/molecules/PostLinkEmbeds/PostLinkEmbeds', () => {
  return {
    PostLinkEmbeds: vi.fn(() => null),
  };
});

vi.mock('@/molecules/PostText/PostText', () => {
  return {
    PostText: vi.fn(() => null),
  };
});

vi.mock('../PostArticle/PostArticle', () => ({
  PostArticle: vi.fn(({ content }: { content: string }) => <div data-testid="post-article">{content}</div>),
}));

vi.mock('@/organisms/Collections/CollectionCard/CollectionCard', () => ({
  CollectionCard: vi.fn(
    ({ authorPubky, postId, presentation }: { authorPubky: string; postId: string; presentation?: string }) => (
      <div
        data-testid="collection-card"
        data-author-pubky={authorPubky}
        data-post-id={postId}
        data-presentation={presentation ?? 'landing'}
      />
    ),
  ),
}));

vi.mock('../PostAttachments/PostAttachments', () => ({
  PostAttachments: vi.fn(() => <div data-testid="post-attachments" />),
}));

vi.mock('../PostContentBlurred/PostContentBlurred', () => ({
  PostContentBlurred: vi.fn(({ postId }: { postId: string }) => (
    <div data-testid="post-content-blurred" data-post-id={postId} />
  )),
}));

vi.mock('@/molecules/PostUnavailable/PostUnavailable', () => ({
  PostUnavailable: ({ message }: { message: string }) => <div data-testid="post-unavailable" data-message={message} />,
}));

const mockUsePostDetails = vi.mocked(usePostDetails);
const mockUseLocalFilesStore = vi.mocked(useLocalFilesStore);
const mockPostAttachments = vi.mocked(PostAttachments);
const mockPostContentBlurred = vi.mocked(PostContentBlurred);
const mockPostArticle = vi.mocked(PostArticle);
const mockPostText = vi.mocked(PostText);

// Helper to create complete PostDetails mock
const createMockPostDetails = (
  overrides: Partial<{
    content: string;
    attachments: string[] | null;
    is_blurred: boolean;
    kind: 'short' | 'long' | 'collection';
  }> = {},
): EnrichedPostDetails => ({
  id: 'test-author:test-post',
  indexed_at: Date.now(),
  kind: 'short' as const,
  uri: 'pubky://test-author/pub/pubky.app/posts/test-post',
  content: 'Mock content',
  attachments: null as string[] | null,
  is_moderated: false,
  is_blurred: false,
  ...overrides,
});

describe('PostContentBase', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUsePostDetails.mockReturnValue({
      postDetails: createMockPostDetails(),
      isLoading: false,
    });
    mockUseLocalFilesStore.mockReturnValue(undefined);
  });

  it('passes the Cards presentation to an article', () => {
    mockUsePostDetails.mockReturnValue({
      postDetails: createMockPostDetails({
        kind: 'long',
        content: JSON.stringify({ title: 'Cards article', body: 'Article body' }),
      }),
      isLoading: false,
    });
    render(<PostContentBase postId="post-123" mediaVariant="cards" />);
    expect(vi.mocked(PostArticle)).toHaveBeenCalledWith(expect.objectContaining({ presentation: 'cards' }), undefined);
  });

  it('renders content when postDetails are available', () => {
    render(<PostContentBase postId="post-123" />);

    expect(screen.getByTestId('container')).toBeInTheDocument();
  });

  it('calls PostAttachments with attachments from postDetails', () => {
    const mockAttachments = ['file-id-1', 'file-id-2'];
    mockUsePostDetails.mockReturnValue({
      postDetails: createMockPostDetails({ content: 'Test content', attachments: mockAttachments }),
      isLoading: false,
    });

    render(<PostContentBase postId="post-123" />);

    expect(mockPostAttachments).toHaveBeenCalledWith(
      { attachments: mockAttachments, localAttachments: undefined },
      undefined,
    );
  });

  it('calls PostAttachments with null when no attachments', () => {
    mockUsePostDetails.mockReturnValue({
      postDetails: createMockPostDetails({ content: 'Test content' }),
      isLoading: false,
    });

    render(<PostContentBase postId="post-123" />);

    expect(mockPostAttachments).toHaveBeenCalledWith({ attachments: null, localAttachments: undefined }, undefined);
  });

  it('calls PostAttachments with empty array', () => {
    mockUsePostDetails.mockReturnValue({
      postDetails: createMockPostDetails({ content: 'Test content', attachments: [] }),
      isLoading: false,
    });

    render(<PostContentBase postId="post-123" />);

    expect(mockPostAttachments).toHaveBeenCalledWith({ attachments: [], localAttachments: undefined }, undefined);
  });

  it('calls PostAttachments with localAttachments from store', () => {
    const mockLocalAttachments = [{ id: 'local-1', blob: new Blob() }];
    mockUseLocalFilesStore.mockReturnValue(mockLocalAttachments);
    mockUsePostDetails.mockReturnValue({
      postDetails: createMockPostDetails({ content: 'Test content', attachments: ['file-id-1'] }),
      isLoading: false,
    });

    render(<PostContentBase postId="post-123" />);

    expect(mockPostAttachments).toHaveBeenCalledWith(
      { attachments: ['file-id-1'], localAttachments: mockLocalAttachments },
      undefined,
    );
  });

  it('renders attachments in the default content stack when there is no text content', () => {
    const mockAttachments = ['file-id-1', 'file-id-2'];
    mockUsePostDetails.mockReturnValue({
      postDetails: createMockPostDetails({ content: '', attachments: mockAttachments }),
      isLoading: false,
    });

    render(<PostContentBase postId="post-123" />);

    expect(mockPostAttachments).toHaveBeenCalledWith(
      { attachments: mockAttachments, localAttachments: undefined },
      undefined,
    );
  });

  it.each(['default', 'cards'] as const)('keeps moderated content hidden in %s', (mediaVariant) => {
    mockUsePostDetails.mockReturnValue({
      postDetails: createMockPostDetails({ content: 'Test content', is_blurred: true }),
      isLoading: false,
    });

    render(<PostContentBase postId="post-123" className="custom-class" mediaVariant={mediaVariant} />);

    expect(screen.getByTestId('post-content-blurred')).toBeInTheDocument();
    expect(mockPostContentBlurred).toHaveBeenCalledWith({ postId: 'post-123', className: 'custom-class' }, undefined);
    expect(mockPostAttachments).not.toHaveBeenCalled();
  });

  it('renders normal content when is_blurred is false', () => {
    mockUsePostDetails.mockReturnValue({
      postDetails: createMockPostDetails({ content: 'Test content', is_blurred: false }),
      isLoading: false,
    });

    render(<PostContentBase postId="post-123" />);

    expect(screen.queryByTestId('post-content-blurred')).not.toBeInTheDocument();
    expect(screen.getByTestId('container')).toBeInTheDocument();
  });

  it('renders PostArticle when kind is long', () => {
    const mockAttachments = ['file-id-1'];
    mockUsePostDetails.mockReturnValue({
      postDetails: createMockPostDetails({
        content: '{"title":"Article Title","body":"Article body content"}',
        attachments: mockAttachments,
        kind: 'long',
      }),
      isLoading: false,
    });

    render(<PostContentBase postId="post-123" className="custom-class" />);

    expect(screen.getByTestId('post-article')).toBeInTheDocument();
    expect(mockPostArticle).toHaveBeenCalledWith(
      {
        content: '{"title":"Article Title","body":"Article body content"}',
        attachments: mockAttachments,
        localAttachments: undefined,
        className: 'custom-class',
      },
      undefined,
    );
    expect(mockPostAttachments).not.toHaveBeenCalled();
  });

  it('calls PostArticle with localAttachments from store', () => {
    const mockLocalAttachments = [{ id: 'local-1', blob: new Blob() }];
    mockUseLocalFilesStore.mockReturnValue(mockLocalAttachments);
    mockUsePostDetails.mockReturnValue({
      postDetails: createMockPostDetails({
        content: '{"title":"Article Title","body":"Article body content"}',
        attachments: ['file-id-1'],
        kind: 'long',
      }),
      isLoading: false,
    });

    render(<PostContentBase postId="post-123" className="custom-class" />);

    expect(mockPostArticle).toHaveBeenCalledWith(
      {
        content: '{"title":"Article Title","body":"Article body content"}',
        attachments: ['file-id-1'],
        localAttachments: mockLocalAttachments,
        className: 'custom-class',
      },
      undefined,
    );
  });

  it('renders PostArticle instead of normal content for long posts', () => {
    mockUsePostDetails.mockReturnValue({
      postDetails: createMockPostDetails({
        content: '{"title":"Test","body":"Body"}',
        kind: 'long',
      }),
      isLoading: false,
    });

    render(<PostContentBase postId="post-123" />);

    expect(screen.getByTestId('post-article')).toBeInTheDocument();
    expect(screen.queryByTestId('container')).not.toBeInTheDocument();
  });

  it('renders malformed long posts as normal post text', () => {
    mockUsePostDetails.mockReturnValue({
      postDetails: createMockPostDetails({
        content: 'raw long content that is not an article envelope',
        kind: 'long',
      }),
      isLoading: false,
    });

    render(<PostContentBase postId="post-123" />);

    expect(screen.queryByTestId('post-article')).not.toBeInTheDocument();
    expect(screen.getByTestId('container')).toBeInTheDocument();
    expect(mockPostText).toHaveBeenCalledWith(
      { content: 'raw long content that is not an article envelope', className: undefined },
      undefined,
    );
  });

  it('renders CollectionCard with embed presentation when kind is collection', () => {
    mockUsePostDetails.mockReturnValue({
      postDetails: createMockPostDetails({
        content: '{"name":"My Collection"}',
        kind: 'collection',
      }),
      isLoading: false,
    });

    render(<PostContentBase postId="author-pubky:raw-post-id" className="custom-class" />);

    const card = screen.getByTestId('collection-card');
    expect(card).toBeInTheDocument();
    expect(card).toHaveAttribute('data-author-pubky', 'author-pubky');
    expect(card).toHaveAttribute('data-post-id', 'raw-post-id');
    expect(card).toHaveAttribute('data-presentation', 'embed');
    expect(screen.queryByTestId('container')).not.toBeInTheDocument();
    expect(screen.queryByTestId('post-article')).not.toBeInTheDocument();
  });

  it('prioritizes is_blurred over kind for blurred articles', () => {
    mockUsePostDetails.mockReturnValue({
      postDetails: createMockPostDetails({
        content: '{"title":"Test","body":"Body"}',
        kind: 'long',
        is_blurred: true,
      }),
      isLoading: false,
    });

    render(<PostContentBase postId="post-123" />);

    expect(screen.getByTestId('post-content-blurred')).toBeInTheDocument();
    expect(screen.queryByTestId('post-article')).not.toBeInTheDocument();
  });

  it('renders PostUnavailable when the post is not found (settled null)', () => {
    mockUsePostDetails.mockReturnValue({ postDetails: null, isLoading: false });

    render(<PostContentBase postId="post-missing" />);

    expect(screen.getByTestId('post-unavailable')).toHaveAttribute('data-message', 'Post not found.');
    expect(screen.queryByTestId('skeleton')).not.toBeInTheDocument();
  });

  it('renders the skeleton (not PostUnavailable) while still loading', () => {
    mockUsePostDetails.mockReturnValue({ postDetails: null, isLoading: true });

    render(<PostContentBase postId="post-loading" />);

    expect(screen.getAllByTestId('skeleton').length).toBeGreaterThan(0);
    expect(screen.queryByTestId('post-unavailable')).not.toBeInTheDocument();
  });
});
