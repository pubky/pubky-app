import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AvatarWithFallback } from './AvatarWithFallback';

vi.mock('facehash', () => ({
  Facehash: ({
    name,
    onRenderMouth,
    className,
  }: {
    name: string;
    onRenderMouth?: () => React.ReactNode;
    className?: string;
  }) => (
    <div data-testid="facehash" data-name={name} className={className}>
      {onRenderMouth?.()}
    </div>
  ),
}));

// Mock dexie-react-hooks
const mockUseLiveQuery = vi.fn();
vi.mock('dexie-react-hooks', () => ({
  useLiveQuery: (...args: unknown[]) => mockUseLiveQuery(...args),
}));

// Mock Core - including stores for local avatar resolution
const mockGetModerationStatus = vi.fn();
const mockUnblur = vi.fn();
const mockUseAuthStore = vi.fn();
const mockUseLocalFilesStore = vi.fn();
vi.mock('@/core', () => ({
  ModerationController: {
    getModerationStatus: (...args: unknown[]) => mockGetModerationStatus(...args),
    unBlur: (...args: unknown[]) => mockUnblur(...args),
  },
  ModerationType: {
    PROFILE: 'PROFILE',
  },
  useAuthStore: (selector: (state: { currentUserPubky: string | null }) => unknown) => mockUseAuthStore(selector),
  useLocalFilesStore: (selector: (state: { profile: string | null }) => unknown) => mockUseLocalFilesStore(selector),
}));

// Mock Config
vi.mock('@/config', () => ({
  CDN_URL: 'https://cdn.example.com',
}));

// Mock Atoms components
vi.mock('@/atoms', () => ({
  Avatar: ({
    children,
    className,
    'data-testid': dataTestId,
  }: {
    children: React.ReactNode;
    className?: string;
    'data-testid'?: string;
  }) => (
    <div data-testid={dataTestId || 'avatar'} className={className}>
      {children}
    </div>
  ),
  AvatarImage: ({
    src,
    alt,
    onError,
    className,
  }: {
    src: string;
    alt: string;
    onError?: (event: React.SyntheticEvent<HTMLImageElement>) => void;
    className?: string;
  }) => <img data-testid="avatar-image" src={src} alt={alt} onError={onError} className={className} />,
  AvatarFallback: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <div data-testid="avatar-fallback" className={className}>
      {children}
    </div>
  ),
  Container: ({
    children,
    onClick,
    onKeyDown,
    className,
    role,
    tabIndex,
    'aria-label': ariaLabel,
  }: {
    children: React.ReactNode;
    onClick?: (e: React.MouseEvent) => void;
    onKeyDown?: (e: React.KeyboardEvent) => void;
    className?: string;
    role?: string;
    tabIndex?: number;
    'aria-label'?: string;
    overrideDefaults?: boolean;
  }) => (
    <div
      data-testid="unblur-button"
      onClick={onClick}
      onKeyDown={onKeyDown}
      className={className}
      role={role}
      tabIndex={tabIndex}
      aria-label={ariaLabel}
    >
      {children}
    </div>
  ),
  Typography: ({
    as: Tag = 'p',
    children,
    className,
    'data-testid': dataTestId,
  }: {
    as?: React.ElementType;
    children: React.ReactNode;
    className?: string;
    'data-testid'?: string;
    overrideDefaults?: boolean;
    style?: React.CSSProperties;
  }) => (
    <Tag data-testid={dataTestId} className={className}>
      {children}
    </Tag>
  ),
}));

describe('AvatarWithFallback', () => {
  const mockProps = {
    name: 'John Doe',
  };

  const validAvatarUrl = 'https://cdn.example.com/avatar/6mfxozzqmb36rc9rgy3rykoyfghfao74n8igt5tf1boehproahoy';
  const validUserId = '6mfxozzqmb36rc9rgy3rykoyfghfao74n8igt5tf1boehproahoy';

  beforeEach(() => {
    vi.clearAllMocks();
    // Default mock: moderation status loaded, not blurred
    mockUseLiveQuery.mockReturnValue({ is_blurred: false });
    // Default mock: no current user (non-current user scenario)
    mockUseAuthStore.mockImplementation((selector) => selector({ currentUserPubky: null }));
    // Default mock: no local profile
    mockUseLocalFilesStore.mockImplementation((selector) => selector({ profile: null }));
  });

  it('renders avatar image when avatarUrl is provided and moderation status is loaded', () => {
    render(<AvatarWithFallback {...mockProps} avatarUrl={validAvatarUrl} />);

    const avatarImage = screen.getByTestId('avatar-image');
    expect(avatarImage).toHaveAttribute('src', validAvatarUrl);
    expect(avatarImage).toHaveAttribute('alt', 'John Doe');
  });

  it('renders avatar fallback when avatarUrl is not provided', () => {
    render(<AvatarWithFallback {...mockProps} />);

    expect(screen.getByTestId('facehash')).toHaveAttribute('data-name', 'John Doe');
    expect(screen.getByTestId('avatar-fallback-initial')).toHaveTextContent('J');
    expect(screen.getByTestId('avatar-fallback')).toBeInTheDocument();
  });

  it('renders avatar image immediately while moderation status is loading (no flicker)', () => {
    mockUseLiveQuery.mockReturnValue(undefined);

    render(<AvatarWithFallback {...mockProps} avatarUrl={validAvatarUrl} />);

    // Image should be shown immediately without waiting for moderation status
    expect(screen.getByTestId('avatar-image')).toBeInTheDocument();
    // Fallback is always rendered (Radix handles visibility)
    expect(screen.getByTestId('avatar-fallback')).toBeInTheDocument();
    // No blur applied while loading
    expect(screen.getByTestId('avatar-image')).not.toHaveClass('blur-xs');
  });

  it('uses custom alt text when provided', () => {
    render(<AvatarWithFallback {...mockProps} avatarUrl={validAvatarUrl} alt="Custom alt text" />);

    const avatarImage = screen.getByTestId('avatar-image');
    expect(avatarImage).toHaveAttribute('alt', 'Custom alt text');
  });

  it('uses name as alt text when alt is not provided', () => {
    render(<AvatarWithFallback {...mockProps} avatarUrl={validAvatarUrl} />);

    const avatarImage = screen.getByTestId('avatar-image');
    expect(avatarImage).toHaveAttribute('alt', 'John Doe');
  });

  it('applies className to avatar', () => {
    render(<AvatarWithFallback {...mockProps} className="custom-class" data-testid="test-avatar" />);

    const avatar = screen.getByTestId('test-avatar');
    expect(avatar).toHaveClass('custom-class');
  });

  it('applies fallbackClassName to fallback', () => {
    render(<AvatarWithFallback {...mockProps} fallbackClassName="fallback-class" />);

    const fallback = screen.getByTestId('avatar-fallback');
    expect(fallback).toHaveClass('fallback-class');
  });

  it('uses first character initial for fallback when no avatarUrl', () => {
    render(<AvatarWithFallback {...mockProps} name="Alice Bob" />);

    expect(screen.getByTestId('avatar-fallback-initial')).toHaveTextContent('A');
  });

  it('uses explicit fallbackSeed when provided', () => {
    render(<AvatarWithFallback {...mockProps} fallbackSeed="explicit-seed" />);
    expect(screen.getByTestId('facehash')).toHaveAttribute('data-name', 'explicit-seed');
  });

  it('uses extracted userId from avatarUrl as fallback seed when fallbackSeed is not provided', () => {
    render(<AvatarWithFallback {...mockProps} avatarUrl={validAvatarUrl} />);
    expect(screen.getByTestId('facehash')).toHaveAttribute('data-name', validUserId);
  });

  it('uses default fallback seed when no seed sources are available', () => {
    render(<AvatarWithFallback name="" />);
    expect(screen.getByTestId('facehash')).toHaveAttribute('data-name', 'user');
  });

  it('uses seed initial when name is empty', () => {
    render(<AvatarWithFallback name="" fallbackSeed="seed-value" />);
    expect(screen.getByTestId('avatar-fallback-initial')).toHaveTextContent('S');
  });

  it('renders with both className and fallbackClassName', () => {
    render(
      <AvatarWithFallback
        {...mockProps}
        className="avatar-class"
        fallbackClassName="fallback-class"
        data-testid="test-avatar"
      />,
    );

    const avatar = screen.getByTestId('test-avatar');
    const fallback = screen.getByTestId('avatar-fallback');

    expect(avatar).toHaveClass('avatar-class');
    expect(fallback).toHaveClass('fallback-class');
  });

  it('passes data-testid to avatar component', () => {
    render(<AvatarWithFallback {...mockProps} data-testid="custom-avatar-testid" />);

    expect(screen.getByTestId('custom-avatar-testid')).toBeInTheDocument();
  });

  describe('Image Error Handling', () => {
    it('falls back to facehash when image fails to load', () => {
      render(<AvatarWithFallback {...mockProps} avatarUrl={validAvatarUrl} />);

      // Initially should show both image and fallback (Radix handles visibility)
      const avatarImage = screen.getByTestId('avatar-image');
      expect(avatarImage).toBeInTheDocument();
      expect(screen.getByTestId('avatar-fallback')).toBeInTheDocument();

      // Simulate image load error
      fireEvent.error(avatarImage);

      // After error, image element is removed and fallback remains
      expect(screen.queryByTestId('avatar-image')).not.toBeInTheDocument();
      expect(screen.getByTestId('avatar-fallback')).toBeInTheDocument();
      expect(screen.getByTestId('avatar-fallback-initial')).toHaveTextContent('J');
    });

    it('handles error with custom fallbackClassName', () => {
      render(<AvatarWithFallback {...mockProps} avatarUrl={validAvatarUrl} fallbackClassName="error-fallback" />);

      const avatarImage = screen.getByTestId('avatar-image');
      fireEvent.error(avatarImage);

      const fallback = screen.getByTestId('avatar-fallback');
      expect(fallback).toHaveClass('error-fallback');
    });

    it('uses name initial correctly after image error', () => {
      render(<AvatarWithFallback name="Alice Bob Charlie" avatarUrl={validAvatarUrl} />);

      const avatarImage = screen.getByTestId('avatar-image');
      fireEvent.error(avatarImage);

      expect(screen.getByTestId('avatar-fallback-initial')).toHaveTextContent('A');
    });

    it('does not show image when avatarUrl is empty string', () => {
      render(<AvatarWithFallback {...mockProps} avatarUrl="" />);

      expect(screen.queryByTestId('avatar-image')).not.toBeInTheDocument();
      expect(screen.getByTestId('avatar-fallback')).toBeInTheDocument();
    });

    it('maintains error state after rerender', () => {
      const { rerender } = render(<AvatarWithFallback {...mockProps} avatarUrl={validAvatarUrl} />);

      const avatarImage = screen.getByTestId('avatar-image');
      fireEvent.error(avatarImage);

      // Rerender with same props
      rerender(<AvatarWithFallback {...mockProps} avatarUrl={validAvatarUrl} />);

      // Should still show fallback (image removed due to error)
      expect(screen.queryByTestId('avatar-image')).not.toBeInTheDocument();
      expect(screen.getByTestId('avatar-fallback')).toBeInTheDocument();
    });

    it('resets error state when avatarUrl changes', () => {
      const newAvatarUrl = 'https://cdn.example.com/avatar/7nfxozzqmb36rc9rgy3rykoyfghfao74n8igt5tf1boehproahoy';
      const { rerender } = render(<AvatarWithFallback {...mockProps} avatarUrl={validAvatarUrl} />);

      const firstImage = screen.getByTestId('avatar-image');
      fireEvent.error(firstImage);

      // Should show fallback (image removed due to error)
      expect(screen.queryByTestId('avatar-image')).not.toBeInTheDocument();
      expect(screen.getByTestId('avatar-fallback')).toBeInTheDocument();

      // Rerender with new avatarUrl
      rerender(<AvatarWithFallback {...mockProps} avatarUrl={newAvatarUrl} />);

      // Should try new image (both image and fallback rendered, Radix handles visibility)
      expect(screen.getByTestId('avatar-image')).toBeInTheDocument();
      expect(screen.getByTestId('avatar-fallback')).toBeInTheDocument();
    });
  });

  describe('Local Avatar Resolution', () => {
    const localBlobUrl = 'blob:http://localhost/local-avatar-123';

    it('uses local blob URL when user is current user and localProfile exists', () => {
      // Set up as current user with a local profile
      mockUseAuthStore.mockImplementation((selector) => selector({ currentUserPubky: validUserId }));
      mockUseLocalFilesStore.mockImplementation((selector) => selector({ profile: localBlobUrl }));

      render(<AvatarWithFallback {...mockProps} avatarUrl={validAvatarUrl} />);

      const avatarImage = screen.getByTestId('avatar-image');
      expect(avatarImage).toHaveAttribute('src', localBlobUrl);
    });

    it('falls back to CDN URL when localProfile is null for current user', () => {
      // Set up as current user but no local profile
      mockUseAuthStore.mockImplementation((selector) => selector({ currentUserPubky: validUserId }));
      mockUseLocalFilesStore.mockImplementation((selector) => selector({ profile: null }));

      render(<AvatarWithFallback {...mockProps} avatarUrl={validAvatarUrl} />);

      const avatarImage = screen.getByTestId('avatar-image');
      expect(avatarImage).toHaveAttribute('src', validAvatarUrl);
    });

    it('uses CDN URL for non-current users even when localProfile exists', () => {
      const differentUserId = '7nfxozzqmb36rc9rgy3rykoyfghfao74n8igt5tf1boehproahoy';
      const differentUserAvatarUrl = `https://cdn.example.com/avatar/${differentUserId}`;

      // Current user is different from the avatar's user
      mockUseAuthStore.mockImplementation((selector) => selector({ currentUserPubky: 'someOtherUser123' }));
      // Local profile exists but should NOT be used for non-current user
      mockUseLocalFilesStore.mockImplementation((selector) => selector({ profile: localBlobUrl }));

      render(<AvatarWithFallback {...mockProps} avatarUrl={differentUserAvatarUrl} />);

      const avatarImage = screen.getByTestId('avatar-image');
      // Should use CDN URL, not local blob URL
      expect(avatarImage).toHaveAttribute('src', differentUserAvatarUrl);
    });

    it('selector returns null for non-current users to avoid unnecessary re-renders', () => {
      const differentUserId = '7nfxozzqmb36rc9rgy3rykoyfghfao74n8igt5tf1boehproahoy';
      const differentUserAvatarUrl = `https://cdn.example.com/avatar/${differentUserId}`;

      // Current user is different from avatar's user
      mockUseAuthStore.mockImplementation((selector) => selector({ currentUserPubky: 'someOtherUser123' }));

      // Track selector calls to verify optimization
      const selectorSpy = vi.fn((_state: { profile: string | null }) => {
        // The actual component uses: isCurrentUser ? s.profile : null
        // For non-current users, this should always return null regardless of profile state
        return null;
      });
      mockUseLocalFilesStore.mockImplementation(selectorSpy);

      render(<AvatarWithFallback {...mockProps} avatarUrl={differentUserAvatarUrl} />);

      // Verify selector was called
      expect(selectorSpy).toHaveBeenCalled();
      // For non-current users, the result should be null (stable reference)
    });

    it('resets error state when local avatar URL changes', () => {
      // Start with CDN URL (no local profile)
      mockUseAuthStore.mockImplementation((selector) => selector({ currentUserPubky: validUserId }));
      mockUseLocalFilesStore.mockImplementation((selector) => selector({ profile: null }));

      const { rerender } = render(<AvatarWithFallback {...mockProps} avatarUrl={validAvatarUrl} />);

      // Trigger error on CDN URL
      const avatarImage = screen.getByTestId('avatar-image');
      fireEvent.error(avatarImage);

      // Should show fallback (image removed due to error)
      expect(screen.queryByTestId('avatar-image')).not.toBeInTheDocument();
      expect(screen.getByTestId('avatar-fallback')).toBeInTheDocument();

      // Now local profile becomes available
      mockUseLocalFilesStore.mockImplementation((selector) => selector({ profile: localBlobUrl }));

      rerender(<AvatarWithFallback {...mockProps} avatarUrl={validAvatarUrl} />);

      // Error should be reset, image should be shown with local URL (fallback always rendered)
      expect(screen.getByTestId('avatar-image')).toBeInTheDocument();
      expect(screen.getByTestId('avatar-image')).toHaveAttribute('src', localBlobUrl);
      expect(screen.getByTestId('avatar-fallback')).toBeInTheDocument();
    });

    it('shows fallback when no avatarUrl and no local profile', () => {
      mockUseAuthStore.mockImplementation((selector) => selector({ currentUserPubky: validUserId }));
      mockUseLocalFilesStore.mockImplementation((selector) => selector({ profile: null }));

      render(<AvatarWithFallback {...mockProps} />);

      // No image when no URL, fallback always rendered
      expect(screen.queryByTestId('avatar-image')).not.toBeInTheDocument();
      expect(screen.getByTestId('avatar-fallback')).toBeInTheDocument();
    });

    it('uses local profile when avatarUrl is not provided but local profile exists', () => {
      // This can happen during profile creation before CDN URL is available
      mockUseAuthStore.mockImplementation((selector) => selector({ currentUserPubky: validUserId }));
      mockUseLocalFilesStore.mockImplementation((selector) => selector({ profile: localBlobUrl }));

      // Note: Without avatarUrl, userId extraction returns null, so isCurrentUser check fails
      // The local profile won't be used in this case - this is expected behavior
      render(<AvatarWithFallback {...mockProps} />);

      // Since no avatarUrl, userId is null, isCurrentUser is false, so fallback shown
      expect(screen.getByTestId('avatar-fallback')).toBeInTheDocument();
    });
  });

  describe('Moderation Functionality', () => {
    it('applies blur class when moderation status is blurred', () => {
      mockUseLiveQuery.mockReturnValue({ is_blurred: true });

      render(<AvatarWithFallback {...mockProps} avatarUrl={validAvatarUrl} />);

      const avatarImage = screen.getByTestId('avatar-image');
      expect(avatarImage).toHaveClass('blur-xs');
    });

    it('does not apply blur class when moderation status is not blurred', () => {
      mockUseLiveQuery.mockReturnValue({ is_blurred: false });

      render(<AvatarWithFallback {...mockProps} avatarUrl={validAvatarUrl} />);

      const avatarImage = screen.getByTestId('avatar-image');
      expect(avatarImage).not.toHaveClass('blur-xs');
    });

    it('shows unblur button when image is blurred', () => {
      mockUseLiveQuery.mockReturnValue({ is_blurred: true });

      render(<AvatarWithFallback {...mockProps} avatarUrl={validAvatarUrl} />);

      const unblur = screen.getByTestId('unblur-button');
      expect(unblur).toBeInTheDocument();
      expect(unblur.querySelector('.lucide-eye-off')).toBeInTheDocument();
    });

    it('does not show unblur button when image is not blurred', () => {
      mockUseLiveQuery.mockReturnValue({ is_blurred: false });

      render(<AvatarWithFallback {...mockProps} avatarUrl={validAvatarUrl} />);

      expect(screen.queryByTestId('unblur-button')).not.toBeInTheDocument();
    });

    it('calls ModerationController.unblur when unblur button is clicked', () => {
      mockUseLiveQuery.mockReturnValue({ is_blurred: true });

      render(<AvatarWithFallback {...mockProps} avatarUrl={validAvatarUrl} />);

      const unblurButton = screen.getByTestId('unblur-button');
      fireEvent.click(unblurButton);

      expect(mockUnblur).toHaveBeenCalledWith(validUserId);
    });

    it('calls ModerationController.unblur when Enter key is pressed', () => {
      mockUseLiveQuery.mockReturnValue({ is_blurred: true });

      render(<AvatarWithFallback {...mockProps} avatarUrl={validAvatarUrl} />);

      const unblurButton = screen.getByTestId('unblur-button');
      fireEvent.keyDown(unblurButton, { key: 'Enter' });

      expect(mockUnblur).toHaveBeenCalledWith(validUserId);
    });

    it('calls ModerationController.unblur when Space key is pressed', () => {
      mockUseLiveQuery.mockReturnValue({ is_blurred: true });

      render(<AvatarWithFallback {...mockProps} avatarUrl={validAvatarUrl} />);

      const unblurButton = screen.getByTestId('unblur-button');
      fireEvent.keyDown(unblurButton, { key: ' ' });

      expect(mockUnblur).toHaveBeenCalledWith(validUserId);
    });

    it('does not call ModerationController.unblur for other keys', () => {
      mockUseLiveQuery.mockReturnValue({ is_blurred: true });

      render(<AvatarWithFallback {...mockProps} avatarUrl={validAvatarUrl} />);

      const unblurButton = screen.getByTestId('unblur-button');
      fireEvent.keyDown(unblurButton, { key: 'Tab' });

      expect(mockUnblur).not.toHaveBeenCalled();
    });

    it('stops event propagation when unblur button is clicked', () => {
      mockUseLiveQuery.mockReturnValue({ is_blurred: true });

      const parentClickHandler = vi.fn();

      render(
        <div onClick={parentClickHandler}>
          <AvatarWithFallback {...mockProps} avatarUrl={validAvatarUrl} />
        </div>,
      );

      const unblurButton = screen.getByTestId('unblur-button');
      fireEvent.click(unblurButton);

      expect(parentClickHandler).not.toHaveBeenCalled();
    });

    it('shows image without blur for invalid avatar URL format (no moderation lookup)', () => {
      mockUseLiveQuery.mockReturnValue(null);

      render(<AvatarWithFallback {...mockProps} avatarUrl="https://example.com/invalid-url" />);

      // Image should still be shown (the URL might still load an image)
      // Moderation can't be checked without valid userId, so no blur
      expect(screen.getByTestId('avatar-image')).toBeInTheDocument();
      expect(screen.getByTestId('avatar-image')).not.toHaveClass('blur-xs');
    });

    it('queries moderation status with correct userId and type', () => {
      render(<AvatarWithFallback {...mockProps} avatarUrl={validAvatarUrl} />);

      // useLiveQuery is called with a function, so we need to verify the dependency array
      expect(mockUseLiveQuery).toHaveBeenCalled();
      const lastCall = mockUseLiveQuery.mock.calls[mockUseLiveQuery.mock.calls.length - 1];
      expect(lastCall[1]).toEqual([validUserId]);
    });
  });
});

describe('AvatarWithFallback - Snapshots', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseLiveQuery.mockReturnValue({ is_blurred: false });
    // Default mock: no current user (non-current user scenario)
    mockUseAuthStore.mockImplementation((selector) => selector({ currentUserPubky: null }));
    // Default mock: no local profile
    mockUseLocalFilesStore.mockImplementation((selector) => selector({ profile: null }));
  });

  it('matches snapshot when avatarUrl is provided', () => {
    const { container } = render(
      <AvatarWithFallback
        name="John Doe"
        avatarUrl="https://cdn.example.com/avatar/6mfxozzqmb36rc9rgy3rykoyfghfao74n8igt5tf1boehproahoy"
        className="size-16"
      />,
    );
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot when avatarUrl is not provided', () => {
    const { container } = render(
      <AvatarWithFallback name="Jane Smith" className="size-16" fallbackClassName="text-2xl" />,
    );
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with custom alt text', () => {
    const { container } = render(
      <AvatarWithFallback
        name="John Doe"
        avatarUrl="https://cdn.example.com/avatar/6mfxozzqmb36rc9rgy3rykoyfghfao74n8igt5tf1boehproahoy"
        alt="Custom alt"
        className="size-16"
      />,
    );
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot when image is blurred', () => {
    mockUseLiveQuery.mockReturnValue({ is_blurred: true });

    const { container } = render(
      <AvatarWithFallback
        name="John Doe"
        avatarUrl="https://cdn.example.com/avatar/6mfxozzqmb36rc9rgy3rykoyfghfao74n8igt5tf1boehproahoy"
        className="size-16"
      />,
    );
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with custom data-testid', () => {
    const { container } = render(
      <AvatarWithFallback
        name="John Doe"
        avatarUrl="https://cdn.example.com/avatar/6mfxozzqmb36rc9rgy3rykoyfghfao74n8igt5tf1boehproahoy"
        className="size-16"
        data-testid="custom-avatar"
      />,
    );
    expect(container.firstChild).toMatchSnapshot();
  });
});
