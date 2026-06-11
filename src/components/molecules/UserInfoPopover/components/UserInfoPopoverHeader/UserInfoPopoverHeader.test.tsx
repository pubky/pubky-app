import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { UserInfoPopoverHeader } from './UserInfoPopoverHeader';

// Mock next/navigation
const mockRouterPush = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockRouterPush,
  }),
}));

vi.mock('@/organisms/AvatarWithFallback/AvatarWithFallback', () => {
  return {
    AvatarWithFallback: ({ name }: { name: string }) => <div data-testid="avatar">{name}</div>,
  };
});

vi.mock('@/atoms/Link/Link', () => {
  return {
    Link: ({
      children,
      href,
      onClick,
      className,
      overrideDefaults,
    }: {
      children: React.ReactNode;
      href: string;
      onClick?: (e: React.MouseEvent) => void;
      className?: string;
      overrideDefaults?: boolean;
    }) => (
      <a
        data-testid="profile-link"
        href={href}
        onClick={onClick}
        className={className}
        data-override-defaults={overrideDefaults}
      >
        {children}
      </a>
    ),
  };
});

describe('UserInfoPopoverHeader', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders user name and public key', () => {
    render(<UserInfoPopoverHeader userId="user123" userName="Test User" formattedPublicKey="test123" avatarUrl="x" />);
    expect(screen.getAllByText('Test User').length).toBeGreaterThan(0);
    expect(screen.getByText('test123')).toBeInTheDocument();
    expect(screen.getByTestId('avatar')).toBeInTheDocument();
  });

  it('renders profile links for avatar and username', () => {
    render(<UserInfoPopoverHeader userId="user123" userName="Test User" formattedPublicKey="test123" avatarUrl="x" />);
    const profileLinks = screen.getAllByTestId('profile-link');
    expect(profileLinks.length).toBe(2); // One for avatar, one for username
    profileLinks.forEach((link) => {
      expect(link).toHaveAttribute('href', '/profile/user123');
    });
  });

  it('navigates to profile when clicking on username link', () => {
    render(<UserInfoPopoverHeader userId="user123" userName="Test User" formattedPublicKey="test123" avatarUrl="x" />);
    const profileLinks = screen.getAllByTestId('profile-link');
    fireEvent.click(profileLinks[1]); // Click on username link
    expect(mockRouterPush).toHaveBeenCalledWith('/profile/user123');
  });

  it('navigates to profile when clicking on avatar link', () => {
    render(<UserInfoPopoverHeader userId="user123" userName="Test User" formattedPublicKey="test123" avatarUrl="x" />);
    const profileLinks = screen.getAllByTestId('profile-link');
    fireEvent.click(profileLinks[0]); // Click on avatar link
    expect(mockRouterPush).toHaveBeenCalledWith('/profile/user123');
  });

  it('stops propagation and prevents default when clicking on username link', () => {
    render(<UserInfoPopoverHeader userId="user123" userName="Test User" formattedPublicKey="test123" avatarUrl="x" />);
    const profileLinks = screen.getAllByTestId('profile-link');
    const clickEvent = new MouseEvent('click', { bubbles: true, cancelable: true });
    const stopPropagationSpy = vi.spyOn(clickEvent, 'stopPropagation');
    const preventDefaultSpy = vi.spyOn(clickEvent, 'preventDefault');

    fireEvent(profileLinks[1], clickEvent);

    expect(stopPropagationSpy).toHaveBeenCalled();
    expect(preventDefaultSpy).toHaveBeenCalled();
  });

  it('does not underline the username on hover', () => {
    render(<UserInfoPopoverHeader userId="user123" userName="Test User" formattedPublicKey="test123" avatarUrl="x" />);

    const usernameLink = screen.getAllByTestId('profile-link')[1];
    const usernameTypography = within(usernameLink).getByTestId('typography');

    expect(usernameTypography).not.toHaveClass('hover:underline');
  });

  it('constrains long user names in the popover preview header', () => {
    const longName = 'BobiWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWW';

    render(<UserInfoPopoverHeader userId="user123" userName={longName} formattedPublicKey="test123" avatarUrl="x" />);

    const profileLinks = screen.getAllByTestId('profile-link');
    const usernameLink = profileLinks[1];
    const usernameTypography = within(usernameLink).getByTestId('typography');

    expect(usernameLink.closest('.w-0.flex-1')).toBeInTheDocument();
    expect(usernameLink).toHaveClass('block', 'w-full', 'min-w-0');
    expect(usernameTypography).toHaveClass('block', 'w-full', 'max-w-full', 'truncate');
  });
});

describe('UserInfoPopoverHeader - Snapshots', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('matches snapshot', () => {
    const { container } = render(
      <UserInfoPopoverHeader
        userId="snapshotUser"
        userName="Snapshot User"
        formattedPublicKey="snapshot123"
        avatarUrl="x"
      />,
    );
    expect(container.firstChild).toMatchSnapshot();
  });
});
