import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PostPageHeader } from './PostPageHeader';

// Mock hooks
const mockNavigateToPost = vi.fn();
const mockAncestors = vi.fn();
const mockUsers = vi.fn();

vi.mock('@/hooks/usePostAncestors/usePostAncestors', () => ({
  usePostAncestors: vi.fn(() => mockAncestors()),
}));

vi.mock('@/hooks/usePostNavigation/usePostNavigation', () => ({
  usePostNavigation: vi.fn(() => ({
    navigateToPost: mockNavigateToPost,
  })),
}));

vi.mock('@/hooks/useUserDetailsFromIds/useUserDetailsFromIds', () => ({
  useUserDetailsFromIds: vi.fn(() => mockUsers()),
}));

describe('PostPageHeader', () => {
  const mockPostId = 'user3:post3';

  beforeEach(() => {
    vi.clearAllMocks();
    mockAncestors.mockReturnValue({
      ancestors: [],
      isLoading: false,
      hasError: false,
    });
    mockUsers.mockReturnValue({
      users: [],
      isLoading: false,
    });
  });

  it('renders loading state while ancestors are loading', () => {
    mockAncestors.mockReturnValue({
      ancestors: [],
      isLoading: true,
      hasError: false,
    });
    mockUsers.mockReturnValue({
      users: [],
      isLoading: false,
    });

    render(<PostPageHeader postId={mockPostId} />);

    // Should show loading state
    expect(screen.getByTestId('post-page-header-loading')).toBeInTheDocument();
  });

  it('renders loading state while user details are loading', () => {
    mockAncestors.mockReturnValue({
      ancestors: [{ postId: 'user1:post1', userId: 'user1' }],
      isLoading: false,
      hasError: false,
    });
    mockUsers.mockReturnValue({
      users: [],
      isLoading: true,
    });

    render(<PostPageHeader postId={mockPostId} />);

    // Should show loading state
    expect(screen.getByTestId('post-page-header-loading')).toBeInTheDocument();
  });

  it('renders "Post by" title for root post (no parents)', () => {
    mockAncestors.mockReturnValue({
      ancestors: [{ postId: 'user1:post1', userId: 'user1' }],
      isLoading: false,
      hasError: false,
    });
    mockUsers.mockReturnValue({
      users: [{ id: 'user1', name: 'John', avatarUrl: undefined }],
      isLoading: false,
    });

    render(<PostPageHeader postId="user1:post1" />);

    expect(screen.getByText('Post by John')).toBeInTheDocument();
    // No breadcrumb for root post
    expect(screen.queryByTestId('post-breadcrumb')).not.toBeInTheDocument();
  });

  it('renders "Reply by" title with breadcrumb for reply post', () => {
    mockAncestors.mockReturnValue({
      ancestors: [
        { postId: 'user1:post1', userId: 'user1' },
        { postId: 'user2:post2', userId: 'user2' },
        { postId: 'user3:post3', userId: 'user3' },
      ],
      isLoading: false,
      hasError: false,
    });
    mockUsers.mockReturnValue({
      users: [
        { id: 'user1', name: 'John', avatarUrl: undefined },
        { id: 'user2', name: 'Satoshi', avatarUrl: undefined },
        { id: 'user3', name: 'Anna', avatarUrl: undefined },
      ],
      isLoading: false,
    });

    render(<PostPageHeader postId={mockPostId} />);

    // Title should show "Reply by" with current author
    expect(screen.getByText('Reply by Anna')).toBeInTheDocument();

    // Breadcrumb should show all ancestors
    expect(screen.getByTestId('post-breadcrumb')).toBeInTheDocument();
    expect(screen.getByText('John')).toBeInTheDocument();
    expect(screen.getByText('Satoshi')).toBeInTheDocument();
    expect(screen.getByText('Anna')).toBeInTheDocument();
  });

  // Note: Breadcrumb click navigation and "Unknown" fallback tests
  // are covered in PostPageBreadcrumb.test.tsx

  it('renders with correct test ids', () => {
    mockAncestors.mockReturnValue({
      ancestors: [{ postId: 'user1:post1', userId: 'user1' }],
      isLoading: false,
      hasError: false,
    });
    mockUsers.mockReturnValue({
      users: [{ id: 'user1', name: 'John', avatarUrl: undefined }],
      isLoading: false,
    });

    render(<PostPageHeader postId="user1:post1" />);

    expect(screen.getByTestId('post-page-header')).toBeInTheDocument();
    expect(screen.getByTestId('post-page-title')).toBeInTheDocument();
  });

  it('matches snapshot for root post', () => {
    mockAncestors.mockReturnValue({
      ancestors: [{ postId: 'user1:post1', userId: 'user1' }],
      isLoading: false,
      hasError: false,
    });
    mockUsers.mockReturnValue({
      users: [{ id: 'user1', name: 'John', avatarUrl: undefined }],
      isLoading: false,
    });

    const { container } = render(<PostPageHeader postId="user1:post1" />);
    expect(container).toMatchSnapshot();
  });

  it('matches snapshot for reply post with breadcrumb', () => {
    mockAncestors.mockReturnValue({
      ancestors: [
        { postId: 'user1:post1', userId: 'user1' },
        { postId: 'user2:post2', userId: 'user2' },
        { postId: 'user3:post3', userId: 'user3' },
      ],
      isLoading: false,
      hasError: false,
    });
    mockUsers.mockReturnValue({
      users: [
        { id: 'user1', name: 'John', avatarUrl: undefined },
        { id: 'user2', name: 'Satoshi', avatarUrl: undefined },
        { id: 'user3', name: 'Anna', avatarUrl: undefined },
      ],
      isLoading: false,
    });

    const { container } = render(<PostPageHeader postId={mockPostId} />);
    expect(container).toMatchSnapshot();
  });
});
