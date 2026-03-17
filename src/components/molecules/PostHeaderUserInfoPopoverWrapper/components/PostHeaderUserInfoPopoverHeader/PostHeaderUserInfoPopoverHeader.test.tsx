import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { PostHeaderUserInfoPopoverHeader } from './PostHeaderUserInfoPopoverHeader';

// Mock next/navigation
const mockRouterPush = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockRouterPush,
  }),
}));

vi.mock('@/organisms', () => ({
  AvatarWithFallback: ({ name }: { name: string }) => <div data-testid="avatar">{name}</div>,
}));

vi.mock('@/atoms', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/atoms')>();
  return {
    ...actual,
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

describe('PostHeaderUserInfoPopoverHeader', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders user name and public key', () => {
    render(
      <PostHeaderUserInfoPopoverHeader
        userId="user123"
        userName="Test User"
        formattedPublicKey="test123"
        avatarUrl="x"
      />,
    );
    expect(screen.getAllByText('Test User').length).toBeGreaterThan(0);
    expect(screen.getByText('test123')).toBeInTheDocument();
    expect(screen.getByTestId('avatar')).toBeInTheDocument();
  });

  it('renders profile links for avatar and username', () => {
    render(
      <PostHeaderUserInfoPopoverHeader
        userId="user123"
        userName="Test User"
        formattedPublicKey="test123"
        avatarUrl="x"
      />,
    );
    const profileLinks = screen.getAllByTestId('profile-link');
    expect(profileLinks.length).toBe(2); // One for avatar, one for username
    profileLinks.forEach((link) => {
      expect(link).toHaveAttribute('href', '/profile/user123');
    });
  });

  it('navigates to profile when clicking on username link', () => {
    render(
      <PostHeaderUserInfoPopoverHeader
        userId="user123"
        userName="Test User"
        formattedPublicKey="test123"
        avatarUrl="x"
      />,
    );
    const profileLinks = screen.getAllByTestId('profile-link');
    fireEvent.click(profileLinks[1]); // Click on username link
    expect(mockRouterPush).toHaveBeenCalledWith('/profile/user123');
  });

  it('navigates to profile when clicking on avatar link', () => {
    render(
      <PostHeaderUserInfoPopoverHeader
        userId="user123"
        userName="Test User"
        formattedPublicKey="test123"
        avatarUrl="x"
      />,
    );
    const profileLinks = screen.getAllByTestId('profile-link');
    fireEvent.click(profileLinks[0]); // Click on avatar link
    expect(mockRouterPush).toHaveBeenCalledWith('/profile/user123');
  });

  it('stops propagation and prevents default when clicking on username link', () => {
    render(
      <PostHeaderUserInfoPopoverHeader
        userId="user123"
        userName="Test User"
        formattedPublicKey="test123"
        avatarUrl="x"
      />,
    );
    const profileLinks = screen.getAllByTestId('profile-link');
    const clickEvent = new MouseEvent('click', { bubbles: true, cancelable: true });
    const stopPropagationSpy = vi.spyOn(clickEvent, 'stopPropagation');
    const preventDefaultSpy = vi.spyOn(clickEvent, 'preventDefault');

    fireEvent(profileLinks[1], clickEvent);

    expect(stopPropagationSpy).toHaveBeenCalled();
    expect(preventDefaultSpy).toHaveBeenCalled();
  });

  it('does not underline the username on hover', () => {
    render(
      <PostHeaderUserInfoPopoverHeader
        userId="user123"
        userName="Test User"
        formattedPublicKey="test123"
        avatarUrl="x"
      />,
    );

    const [, usernameTypography] = screen.getAllByTestId('typography');

    expect(usernameTypography).not.toHaveClass('hover:underline');
  });
});

describe('PostHeaderUserInfoPopoverHeader - Snapshots', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('matches snapshot', () => {
    const { container } = render(
      <PostHeaderUserInfoPopoverHeader
        userId="snapshotUser"
        userName="Snapshot User"
        formattedPublicKey="snapshot123"
        avatarUrl="x"
      />,
    );
    expect(container.firstChild).toMatchSnapshot();
  });
});
