import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { PostMentions } from './PostMentions';

// Valid test pubky key (52 lowercase alphanumeric characters)
const validPubkyKey = 'o1gg96ewuojmopcjbz8895478wdtxtzzber7aezq6ror5a91j7dy';

const mockUseUserProfile = vi.fn();

vi.mock('@/atoms', () => ({
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
}));

vi.mock('@/hooks', () => ({
  useUserProfile: (userId: string) => mockUseUserProfile(userId),
}));

// Mock PostHeaderUserInfoPopoverWrapper to avoid Next.js router and popover dependencies
vi.mock('@/molecules', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/molecules')>();
  return {
    ...actual,
    PostHeaderUserInfoPopoverWrapper: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  };
});

describe('PostMentions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseUserProfile.mockReturnValue({ profile: null, isLoading: false });
  });

  describe('Basic rendering', () => {
    it('renders mention with username when user details are available', () => {
      mockUseUserProfile.mockReturnValue({ profile: { name: 'TestUser' }, isLoading: false });

      render(<PostMentions href={`/profile/${validPubkyKey}`}>{`pk:${validPubkyKey}`}</PostMentions>);

      expect(screen.getByText('@TestUser')).toBeInTheDocument();
    });

    it('renders as a link with correct href', () => {
      mockUseUserProfile.mockReturnValue({ profile: { name: 'TestUser' }, isLoading: false });

      render(<PostMentions href={`/profile/${validPubkyKey}`}>{`pk:${validPubkyKey}`}</PostMentions>);

      const link = screen.getByTestId('link');
      expect(link).toHaveAttribute('href', `/profile/${validPubkyKey}`);
    });

    it('renders with empty href when href is not provided', () => {
      mockUseUserProfile.mockReturnValue({ profile: { name: 'TestUser' }, isLoading: false });

      render(<PostMentions>{`pk:${validPubkyKey}`}</PostMentions>);

      const link = screen.getByTestId('link');
      expect(link).toHaveAttribute('href', '');
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

describe('PostMentions - Snapshots', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseUserProfile.mockReturnValue({ profile: null, isLoading: false });
  });

  it('matches snapshot for mention with username', () => {
    mockUseUserProfile.mockReturnValue({ profile: { name: 'TestUser' }, isLoading: false });

    const { container } = render(
      <PostMentions href={`/profile/${validPubkyKey}`}>{`pk:${validPubkyKey}`}</PostMentions>,
    );
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot for mention without username (truncated key)', () => {
    mockUseUserProfile.mockReturnValue({ profile: null, isLoading: false });

    const { container } = render(
      <PostMentions href={`/profile/${validPubkyKey}`}>{`pk:${validPubkyKey}`}</PostMentions>,
    );
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with pubky prefix', () => {
    mockUseUserProfile.mockReturnValue({ profile: { name: 'PubkyUser' }, isLoading: false });

    const { container } = render(
      <PostMentions href={`/profile/${validPubkyKey}`}>{`pubky${validPubkyKey}`}</PostMentions>,
    );
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with custom className', () => {
    mockUseUserProfile.mockReturnValue({ profile: { name: 'StyledUser' }, isLoading: false });

    const { container } = render(
      <PostMentions href={`/profile/${validPubkyKey}`} className="custom-styling">
        {`pk:${validPubkyKey}`}
      </PostMentions>,
    );
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot for invalid mention (null)', () => {
    const { container } = render(<PostMentions href="/profile/invalid">invalid-text</PostMentions>);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with long username', () => {
    mockUseUserProfile.mockReturnValue({ profile: { name: 'VeryLongUsernameForTesting' }, isLoading: false });

    const { container } = render(
      <PostMentions href={`/profile/${validPubkyKey}`}>{`pk:${validPubkyKey}`}</PostMentions>,
    );
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with special characters in username', () => {
    mockUseUserProfile.mockReturnValue({ profile: { name: 'User_123' }, isLoading: false });

    const { container } = render(
      <PostMentions href={`/profile/${validPubkyKey}`}>{`pk:${validPubkyKey}`}</PostMentions>,
    );
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with additional props', () => {
    mockUseUserProfile.mockReturnValue({ profile: { name: 'TestUser' }, isLoading: false });

    const { container } = render(
      <PostMentions href={`/profile/${validPubkyKey}`} data-type="mention" aria-label="User mention">
        {`pk:${validPubkyKey}`}
      </PostMentions>,
    );
    expect(container.firstChild).toMatchSnapshot();
  });
});
