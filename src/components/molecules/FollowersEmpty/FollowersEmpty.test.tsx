import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FollowersEmpty } from './FollowersEmpty';

const mocks = vi.hoisted(() => ({
  requireAuth: vi.fn(<T,>(action: () => T) => action()),
}));

vi.mock('@/hooks/useRequireAuth/useRequireAuth', () => ({
  useRequireAuth: () => ({
    isAuthenticated: true,
    requireAuth: mocks.requireAuth,
  }),
}));

vi.mock('@/organisms/DialogNewPost/DialogNewPost', () => ({
  DialogNewPost: ({ open, onOpenChangeAction }: { open: boolean; onOpenChangeAction: (open: boolean) => void }) => (
    <div data-testid="dialog-new-post" data-open={open}>
      <button type="button" data-testid="mock-close-btn" onClick={() => onOpenChangeAction(false)}>
        Close
      </button>
    </div>
  ),
}));

// Mock atoms
vi.mock('@/atoms/Button/Button', () => {
  return {
    Button: ({
      children,
      className,
      variant,
      onClick,
      ...props
    }: {
      children: React.ReactNode;
      className?: string;
      variant?: string;
      onClick?: () => void;
    }) => (
      <button
        type="button"
        data-testid="button"
        className={className}
        data-variant={variant}
        onClick={onClick}
        {...props}
      >
        {children}
      </button>
    ),
    ButtonVariant: {
      DEFAULT: 'default',
      DESTRUCTIVE: 'destructive',
      OUTLINE: 'outline',
      SECONDARY: 'secondary',
      GHOST: 'ghost',
      BRAND: 'brand',
      LINK: 'link',
    },
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

vi.mock('@/atoms/Typography/Typography', () => {
  return {
    Typography: ({
      children,
      as: Tag = 'p',
      className,
    }: {
      children: React.ReactNode;
      as?: React.ElementType;
      className?: string;
    }) => (
      <Tag data-testid="typography" className={className}>
        {children}
      </Tag>
    ),
  };
});

describe('FollowersEmpty', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAuth.mockImplementation(<T,>(action: () => T) => action());
  });

  it('renders title', () => {
    render(<FollowersEmpty />);
    expect(screen.getByText(/Looking for followers?/i)).toBeInTheDocument();
  });

  it('opens the new post dialog when Create a Post is clicked', () => {
    render(<FollowersEmpty />);

    expect(screen.getByTestId('dialog-new-post')).toHaveAttribute('data-open', 'false');

    fireEvent.click(screen.getByRole('button', { name: /Create a Post/i }));

    expect(mocks.requireAuth).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('dialog-new-post')).toHaveAttribute('data-open', 'true');
  });
});

describe('FollowersEmpty - Snapshots', () => {
  it('matches snapshot with default props', () => {
    const { container } = render(<FollowersEmpty />);
    expect(container.firstChild).toMatchSnapshot();
  });
});
