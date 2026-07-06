import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { APP_ROUTES } from '@/app/routes';
import { FollowingEmpty } from './FollowingEmpty';

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  requireAuth: vi.fn(<T,>(action: () => T) => action()),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mocks.push,
  }),
}));

vi.mock('@/hooks/useRequireAuth/useRequireAuth', () => ({
  useRequireAuth: () => ({
    isAuthenticated: true,
    requireAuth: mocks.requireAuth,
  }),
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

describe('FollowingEmpty', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAuth.mockImplementation(<T,>(action: () => T) => action());
  });

  it('renders title', () => {
    render(<FollowingEmpty />);
    expect(screen.getByText(/You are the algorithm/i)).toBeInTheDocument();
  });

  it('navigates to Who to Follow when the first button is clicked', () => {
    render(<FollowingEmpty />);

    fireEvent.click(screen.getByRole('button', { name: /Who to Follow/i }));

    expect(mocks.requireAuth).toHaveBeenCalledTimes(1);
    expect(mocks.push).toHaveBeenCalledWith(APP_ROUTES.WHO_TO_FOLLOW);
  });

  it('navigates to Hot when Popular Users is clicked', () => {
    render(<FollowingEmpty />);

    fireEvent.click(screen.getByRole('button', { name: /Popular Users/i }));

    expect(mocks.push).toHaveBeenCalledWith(APP_ROUTES.HOT);
  });
});

describe('FollowingEmpty - Snapshots', () => {
  it('matches snapshot with default props', () => {
    const { container } = render(<FollowingEmpty />);
    expect(container.firstChild).toMatchSnapshot();
  });
});
