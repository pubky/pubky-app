import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PostPreviewNestingProvider } from '@/molecules/PostPreviewCard/PostPreviewNestingContext';
import { PostMentions } from './PostMentions';

// Valid test pubky key (52 lowercase alphanumeric characters)
const validPubkyKey = 'o1gg96ewuojmopcjbz8895478wdtxtzzber7aezq6ror5a91j7dy';

const mockUseUserProfile = vi.fn();
const mockCurrentUserPubky = vi.fn();

vi.mock('@/atoms/Link/Link', () => {
  return {
    Link: ({
      children,
      href,
      className,
      onClick,
      ...props
    }: {
      children: React.ReactNode;
      href: string;
      className?: string;
      onClick?: (e: React.MouseEvent) => void;
    }) => (
      <a data-testid="link" href={href} className={className} onClick={onClick} {...props}>
        {children}
      </a>
    ),
  };
});

vi.mock('@/hooks/useUserProfile/useUserProfile', () => ({
  useUserProfile: (userId: string) => mockUseUserProfile(userId),
}));

vi.mock('@/stores/auth/auth.store', () => ({
  useAuthStore: (selector?: (state: { currentUserPubky: string | null }) => unknown) => {
    const state = { currentUserPubky: mockCurrentUserPubky() };
    return typeof selector === 'function' ? selector(state) : state;
  },
}));

vi.mock('@/molecules/UserInfoPopover/UserInfoPopover', () => {
  return {
    UserInfoPopover: ({ children }: { children: React.ReactNode }) => (
      <div data-testid="user-info-popover">{children}</div>
    ),
  };
});

describe('PostMentions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseUserProfile.mockReturnValue({ profile: null, isLoading: false });
    mockCurrentUserPubky.mockReturnValue(null);
  });

  describe('Basic rendering', () => {
    it('renders mention with username when user details are available', () => {
      mockUseUserProfile.mockReturnValue({ profile: { name: 'TestUser' }, isLoading: false });

      render(<PostMentions href={`/profile/${validPubkyKey}`}>{`pk:${validPubkyKey}`}</PostMentions>);

      expect(screen.getByText('@TestUser')).toBeInTheDocument();
    });

    it('renders as a link with the self-aware profile href', () => {
      mockUseUserProfile.mockReturnValue({ profile: { name: 'TestUser' }, isLoading: false });

      render(<PostMentions href={`/profile/${validPubkyKey}`}>{`pk:${validPubkyKey}`}</PostMentions>);

      const link = screen.getByTestId('link');
      expect(link).toHaveAttribute('href', `/profile/${validPubkyKey}`);
    });

    it('derives the href from the mention pubky regardless of the href prop', () => {
      mockUseUserProfile.mockReturnValue({ profile: { name: 'TestUser' }, isLoading: false });

      render(<PostMentions>{`pk:${validPubkyKey}`}</PostMentions>);

      const link = screen.getByTestId('link');
      expect(link).toHaveAttribute('href', `/profile/${validPubkyKey}`);
    });

    it('resolves a self-mention to the canonical own-profile route', () => {
      mockUseUserProfile.mockReturnValue({ profile: { name: 'Me' }, isLoading: false });
      mockCurrentUserPubky.mockReturnValue(validPubkyKey);

      render(<PostMentions href={`/profile/${validPubkyKey}`}>{`pk:${validPubkyKey}`}</PostMentions>);

      const link = screen.getByTestId('link');
      expect(link).toHaveAttribute('href', '/profile');
    });

    it('applies custom className', () => {
      mockUseUserProfile.mockReturnValue({ profile: { name: 'TestUser' }, isLoading: false });

      render(
        <PostMentions href={`/profile/${validPubkyKey}`} className="custom-class">
          {`pk:${validPubkyKey}`}
        </PostMentions>,
      );

      const link = screen.getByTestId('link');
      expect(link.className).toContain('custom-class');
    });

    it('applies default text-base styling', () => {
      mockUseUserProfile.mockReturnValue({ profile: { name: 'TestUser' }, isLoading: false });

      render(<PostMentions href={`/profile/${validPubkyKey}`}>{`pk:${validPubkyKey}`}</PostMentions>);

      const link = screen.getByTestId('link');
      expect(link.className).toContain('text-base');
    });
  });

  describe('Null rendering', () => {
    it('returns null when userId cannot be extracted from children', () => {
      const { container } = render(<PostMentions href="/profile/invalid">invalid-mention</PostMentions>);

      expect(container.firstChild).toBeNull();
    });

    it('returns null for empty children', () => {
      const { container } = render(<PostMentions href="/profile/test">{''}</PostMentions>);

      expect(container.firstChild).toBeNull();
    });

    it('returns null when pubky key has invalid format', () => {
      const { container } = render(<PostMentions href="/profile/test">pk:invalidkey</PostMentions>);

      expect(container.firstChild).toBeNull();
    });
  });

  describe('Click behavior', () => {
    it('stops event propagation on click', () => {
      mockUseUserProfile.mockReturnValue({ profile: { name: 'TestUser' }, isLoading: false });
      const parentClickHandler = vi.fn();

      render(
        <div onClick={parentClickHandler}>
          <PostMentions href={`/profile/${validPubkyKey}`}>{`pk:${validPubkyKey}`}</PostMentions>
        </div>,
      );

      const link = screen.getByTestId('link');
      fireEvent.click(link);

      expect(parentClickHandler).not.toHaveBeenCalled();
    });
  });

  describe('Non-navigating post preview (reply/repost dialog)', () => {
    it('renders the mention as styled text without the profile link or popover', () => {
      mockUseUserProfile.mockReturnValue({ profile: { name: 'TestUser' }, isLoading: false });

      const { container } = render(
        <PostPreviewNestingProvider navigable={false}>
          <PostMentions href={`/profile/${validPubkyKey}`} data-type="mention">
            {`pk:${validPubkyKey}`}
          </PostMentions>
        </PostPreviewNestingProvider>,
      );

      expect(screen.queryByTestId('link')).not.toBeInTheDocument();
      expect(screen.queryByTestId('user-info-popover')).not.toBeInTheDocument();
      expect(container.querySelector('a')).not.toBeInTheDocument();

      const mention = screen.getByText('@TestUser');
      expect(mention.tagName).toBe('SPAN');
      expect(mention).toHaveAttribute('data-type', 'mention');
      expect(mention).toHaveClass('text-brand', 'text-base');
      expect(mention).not.toHaveClass('uppercase');
    });

    it('uppercases the truncated pubky fallback as text when the profile has no name', () => {
      mockUseUserProfile.mockReturnValue({ profile: null, isLoading: false });

      render(
        <PostPreviewNestingProvider navigable={false}>
          <PostMentions href={`/profile/${validPubkyKey}`}>{`pk:${validPubkyKey}`}</PostMentions>
        </PostPreviewNestingProvider>,
      );

      const mention = screen.getByText(/\.\.\./);
      expect(mention.tagName).toBe('SPAN');
      expect(mention).toHaveClass('uppercase');
    });

    it('keeps the profile link and popover inside a navigable preview (feed repost)', () => {
      mockUseUserProfile.mockReturnValue({ profile: { name: 'TestUser' }, isLoading: false });

      render(
        <PostPreviewNestingProvider>
          <PostMentions href={`/profile/${validPubkyKey}`}>{`pk:${validPubkyKey}`}</PostMentions>
        </PostPreviewNestingProvider>,
      );

      expect(screen.getByTestId('link')).toHaveAttribute('href', `/profile/${validPubkyKey}`);
      expect(screen.getByTestId('user-info-popover')).toBeInTheDocument();
    });
  });

  describe('User lookup', () => {
    it('calls useUserProfile with extracted userId', () => {
      mockUseUserProfile.mockReturnValue({ profile: { name: 'TestUser' }, isLoading: false });

      render(<PostMentions href={`/profile/${validPubkyKey}`}>{`pk:${validPubkyKey}`}</PostMentions>);

      expect(mockUseUserProfile).toHaveBeenCalledWith(validPubkyKey);
    });

    it('handles user with pubky prefix', () => {
      mockUseUserProfile.mockReturnValue({ profile: { name: 'PubkyUser' }, isLoading: false });

      render(<PostMentions href={`/profile/${validPubkyKey}`}>{`pubky${validPubkyKey}`}</PostMentions>);

      expect(screen.getByText('@PubkyUser')).toBeInTheDocument();
      expect(mockUseUserProfile).toHaveBeenCalledWith(validPubkyKey);
    });

    it('displays username with @ prefix when available', () => {
      mockUseUserProfile.mockReturnValue({ profile: { name: 'Alice' }, isLoading: false });

      render(<PostMentions href={`/profile/${validPubkyKey}`}>{`pk:${validPubkyKey}`}</PostMentions>);

      expect(screen.getByText('@Alice')).toBeInTheDocument();
    });
  });

  describe('Props forwarding', () => {
    it('forwards additional props to the Link component', () => {
      mockUseUserProfile.mockReturnValue({ profile: { name: 'TestUser' }, isLoading: false });

      render(
        <PostMentions href={`/profile/${validPubkyKey}`} data-custom="value">
          {`pk:${validPubkyKey}`}
        </PostMentions>,
      );

      const link = screen.getByTestId('link');
      expect(link).toHaveAttribute('data-custom', 'value');
    });

    it('does not forward node and ref props', () => {
      mockUseUserProfile.mockReturnValue({ profile: { name: 'TestUser' }, isLoading: false });

      const { container } = render(
        <PostMentions href={`/profile/${validPubkyKey}`} data-type="mention">
          {`pk:${validPubkyKey}`}
        </PostMentions>,
      );

      expect(container.firstChild).toBeInTheDocument();
    });
  });

  describe('Truncation behavior', () => {
    it('shows truncated pubky with ellipsis when no username', () => {
      mockUseUserProfile.mockReturnValue({ profile: null, isLoading: false });

      render(<PostMentions href={`/profile/${validPubkyKey}`}>{`pk:${validPubkyKey}`}</PostMentions>);

      const link = screen.getByTestId('link');
      const text = link.textContent || '';
      // formatPublicKey with length 8: first 4 + ... + last 4 (no pubky prefix)
      // For key starting with 'o1gg' and ending with 'j7dy', expect 'o1gg...j7dy'
      expect(text).toContain('...');
      expect(text.length).toBeLessThanOrEqual(11); // 4 + 3 + 4 = 11 chars max
    });
  });
});
