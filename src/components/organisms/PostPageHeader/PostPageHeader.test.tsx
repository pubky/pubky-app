import { render, screen, within } from '@testing-library/react';
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

    expect(screen.getByTestId('post-page-title')).toHaveTextContent('Post by John');
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
    expect(screen.getByTestId('post-page-title')).toHaveTextContent('Reply by Anna');

    // Breadcrumb should show all ancestors
    const breadcrumb = screen.getByTestId('post-breadcrumb');
    expect(breadcrumb).toBeInTheDocument();
    expect(within(breadcrumb).getByText('John')).toBeInTheDocument();
    expect(within(breadcrumb).getByText('Satoshi')).toBeInTheDocument();
    expect(within(breadcrumb).getByText('Anna')).toBeInTheDocument();
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

  it('truncates long author names in the page title', () => {
    const longName = 'This is an extremely long profile name that should truncate on the post page title';

    mockAncestors.mockReturnValue({
      ancestors: [{ postId: 'user1:post1', userId: 'user1' }],
      isLoading: false,
      hasError: false,
    });
    mockUsers.mockReturnValue({
      users: [{ id: 'user1', name: longName, avatarUrl: undefined }],
      isLoading: false,
    });

    render(<PostPageHeader postId="user1:post1" />);

    const title = screen.getByTestId('post-page-title');
    expect(title).toHaveClass('flex', 'w-full', 'min-w-0', 'md:w-0', 'md:flex-1');
    expect(within(title).getByText('Post by')).toHaveClass('shrink-0');
    expect(within(title).getByText(longName)).toHaveClass('min-w-0', 'flex-1', 'truncate');
  });

  it('constrains breadcrumb wrapper so long ancestor names can truncate', () => {
    const longName = 'This is an extremely long profile name that should truncate in the breadcrumb trail';

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
        { id: 'user3', name: longName, avatarUrl: undefined },
      ],
      isLoading: false,
    });

    render(<PostPageHeader postId={mockPostId} />);

    const wrapper = screen.getByTestId('post-page-breadcrumb-wrapper');
    expect(wrapper).toHaveClass('w-full', 'min-w-0', 'md:ml-auto', 'md:w-full', 'md:max-w-[50%]', 'md:min-w-0');

    const breadcrumb = screen.getByTestId('post-breadcrumb');
    expect(breadcrumb).toHaveClass('w-full', 'min-w-0');
    expect(within(breadcrumb).getByText(longName)).toHaveClass('truncate');
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
