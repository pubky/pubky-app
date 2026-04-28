import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { HeaderSignIn } from './HeaderSignIn';

// Mock hooks
const mockUseCurrentUserProfile = vi.fn(() => ({
  userDetails: { name: 'Test User', image: 'test-image.jpg' } as { name: string; image: string } | null,
  currentUserPubky: 'test-pubky-123' as string | null,
}));

vi.mock('@/hooks/useCurrentUserProfile/useCurrentUserProfile', () => ({
  useCurrentUserProfile: () => mockUseCurrentUserProfile(),
}));

// Mock core
vi.mock('@/core', () => ({
  useNotificationStore: vi.fn((selector: (state: { selectUnread: () => number }) => number) => {
    const state = {
      selectUnread: () => 5,
    };
    return selector(state);
  }),
  FileController: {
    getAvatarUrl: vi.fn((pubky: string) => `https://cdn.example.com/avatar/${pubky}`),
  },
  TIMEFRAME: {
    TODAY: 'today',
    THIS_MONTH: 'this_month',
    ALL_TIME: 'all_time',
  },
}));

// Mock organisms
vi.mock('@/organisms', () => ({
  SearchInput: () => <div data-testid="search-input">Search Input</div>,
}));

// Mock molecules
vi.mock('@/molecules', () => ({
  HeaderNavigationButtons: ({
    avatarImage,
    avatarName,
    avatarSeed,
    counter,
  }: {
    avatarImage?: string;
    avatarName?: string;
    avatarSeed?: string;
    counter?: number;
  }) => (
    <div
      data-testid="header-navigation-buttons"
      data-avatar-image={avatarImage}
      data-avatar-name={avatarName}
      data-avatar-seed={avatarSeed}
      data-counter={counter?.toString()}
    >
      Navigation Buttons
    </div>
  ),
}));

// Mock atoms
vi.mock('@/atoms', () => ({
  Container: ({
    children,
    className,
    ...props
  }: {
    children: React.ReactNode;
    className?: string;
    [key: string]: unknown;
  }) => (
    <div className={className} {...props}>
      {children}
    </div>
  ),
}));

describe('HeaderSignIn', () => {
  it('renders search input and navigation buttons', () => {
    render(<HeaderSignIn />);

    expect(screen.getByTestId('search-input')).toBeInTheDocument();
    expect(screen.getByTestId('header-navigation-buttons')).toBeInTheDocument();
  });

  it('passes avatar image and name to navigation buttons', () => {
    render(<HeaderSignIn />);

    const navButtons = screen.getByTestId('header-navigation-buttons');
    expect(navButtons).toHaveAttribute('data-avatar-image', 'https://cdn.example.com/avatar/test-pubky-123');
    expect(navButtons).toHaveAttribute('data-avatar-name', 'Test User');
    expect(navButtons).toHaveAttribute('data-avatar-seed', 'test-pubky-123');
  });

  it('passes notification counter to navigation buttons', () => {
    render(<HeaderSignIn />);

    const navButtons = screen.getByTestId('header-navigation-buttons');
    expect(navButtons).toHaveAttribute('data-counter', '5');
  });

  it('handles missing user details gracefully', () => {
    mockUseCurrentUserProfile.mockReturnValueOnce({
      userDetails: null,
      currentUserPubky: null,
    });

    render(<HeaderSignIn />);

    const navButtons = screen.getByTestId('header-navigation-buttons');
    expect(navButtons).not.toHaveAttribute('data-avatar-name');
  });

  it('applies correct container classes', () => {
    const { container } = render(<HeaderSignIn />);
    const containerElement = container.firstChild as HTMLElement;

    expect(containerElement).toHaveClass('flex-1', 'flex-row', 'items-center', 'justify-end', 'gap-3');
  });

  it('passes through additional props', () => {
    render(<HeaderSignIn data-testid="custom-header-sign-in" className="custom-class" />);

    const container = screen.getByTestId('custom-header-sign-in');
    expect(container).toHaveClass('custom-class');
  });
});

describe('HeaderSignIn - Snapshots', () => {
  it('matches snapshot for default HeaderSignIn', () => {
    const { container } = render(<HeaderSignIn />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with custom className', () => {
    const { container } = render(<HeaderSignIn className="custom-class" />);
    expect(container.firstChild).toMatchSnapshot();
  });
});
