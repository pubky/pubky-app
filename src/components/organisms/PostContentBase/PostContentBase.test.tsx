import * as React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PostContentBase } from './PostContentBase';
import * as Molecules from '@/molecules';
import * as Organisms from '@/organisms';
import { usePostDetails } from '@/hooks/usePostDetails/usePostDetails';
import { asOpaque } from '@/test-utils';
import type { EnrichedPostDetails } from '@/application/moderation/moderation.types';
import { useLocalFilesStore } from '@/stores/localFiles/localFiles.store';
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
vi.mock('@/atoms', () => ({
  Container: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <div data-testid="container" className={className}>
      {children}
    </div>
  ),
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
  Skeleton: ({ className }: { className?: string }) => <div data-testid="skeleton" className={className} />,
}));

// Mock molecules - PostText, PostLinkEmbeds
vi.mock('@/molecules', () => ({
  PostText: vi.fn(() => null),
  PostLinkEmbeds: vi.fn(() => null),
}));

// Mock organisms - PostAttachments, PostContentBlurred, PostArticle
vi.mock('@/organisms', () => ({
  PostAttachments: vi.fn(() => <div data-testid="post-attachments" />),
  PostContentBlurred: vi.fn(() => <div data-testid="post-content-blurred" />),
  PostArticle: vi.fn(() => <div data-testid="post-article" />),
}));

const mockUsePostDetails = vi.mocked(usePostDetails);
const mockUseLocalFilesStore = vi.mocked(useLocalFilesStore);
const mockPostAttachments = vi.mocked(Organisms.PostAttachments);
const mockPostContentBlurred = vi.mocked(Organisms.PostContentBlurred);
const mockPostArticle = vi.mocked(Organisms.PostArticle);

// Helper to create complete PostDetails mock
const createMockPostDetails = (
  overrides: Partial<{
    content: string;
    attachments: string[] | null;
    is_blurred: boolean;
    kind: 'short' | 'long';
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

  it('renders PostContentBlurred when is_blurred is true', () => {
    mockUsePostDetails.mockReturnValue({
      postDetails: createMockPostDetails({ content: 'Test content', is_blurred: true }),
      isLoading: false,
    });

    render(<PostContentBase postId="post-123" className="custom-class" />);

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
});

describe('PostContentBase - Snapshots', () => {
  // Use real PostText and PostLinkEmbeds for snapshot tests
  // PostAttachments remains mocked to avoid useToast dependency chain
  beforeEach(async () => {
    vi.clearAllMocks();
    mockUseLocalFilesStore.mockReturnValue(undefined);
    // Import specific modules directly to avoid barrel export timeout (loading all 70+ molecules)
    const actualPostText = await vi.importActual<{ PostText: typeof Molecules.PostText }>(
      '@/molecules/PostText/PostText',
    );
    const actualPostLinkEmbeds = await vi.importActual<{ PostLinkEmbeds: typeof Molecules.PostLinkEmbeds }>(
      '@/molecules/PostLinkEmbeds/PostLinkEmbeds',
    );
    // Replace the mock implementations with real ones for snapshots
    // PostText is wrapped with React.memo(), so we need to access the underlying function via .type
    const memoizedPostText = asOpaque<React.MemoExoticComponent<React.FC<unknown>>>(actualPostText.PostText);
    const PostTextComponent = asOpaque<typeof Molecules.PostText>(memoizedPostText.type);
    vi.mocked(Molecules.PostText).mockImplementation(PostTextComponent);
    vi.mocked(Molecules.PostLinkEmbeds).mockImplementation(actualPostLinkEmbeds.PostLinkEmbeds);
    // PostAttachments stays mocked - it has its own test file
  }, 30000); // Increase timeout to 30 seconds

  it('matches snapshot with single-line content', () => {
    mockUsePostDetails.mockReturnValue({
      postDetails: createMockPostDetails({ content: 'One liner' }),
      isLoading: false,
    });

    const { container } = render(<PostContentBase postId="post-1" />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with multiline content (preserves newlines)', () => {
    mockUsePostDetails.mockReturnValue({
      postDetails: createMockPostDetails({ content: 'Line 1\nLine 2\n\nLine 3' }),
      isLoading: false,
    });

    const { container } = render(<PostContentBase postId="post-2" />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with empty content', () => {
    mockUsePostDetails.mockReturnValue({
      postDetails: createMockPostDetails({ content: '' }),
      isLoading: false,
    });

    const { container } = render(<PostContentBase postId="post-3" />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with loading state', () => {
    mockUsePostDetails.mockReturnValue({
      postDetails: null,
      isLoading: true,
    });

    const { container } = render(<PostContentBase postId="post-loading" />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with very long content', () => {
    const longContent = 'A'.repeat(1000) + ' ' + 'B'.repeat(1000);
    mockUsePostDetails.mockReturnValue({
      postDetails: createMockPostDetails({ content: longContent }),
      isLoading: false,
    });

    const { container } = render(<PostContentBase postId="post-5" />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with special characters in content', () => {
    mockUsePostDetails.mockReturnValue({
      postDetails: createMockPostDetails({ content: 'Content with <tags> & "quotes" & \'apostrophes\'' }),
      isLoading: false,
    });

    const { container } = render(<PostContentBase postId="post-6" />);
    expect(container.firstChild).toMatchSnapshot();
  });
});
