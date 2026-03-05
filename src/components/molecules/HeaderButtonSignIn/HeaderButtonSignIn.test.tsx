import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { HeaderButtonSignIn } from './HeaderButtonSignIn';

// Mock Next.js navigation
const mockPush = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
  }),
}));

// Mock atoms
vi.mock('@/atoms', () => ({
  Button: ({
    children,
    onClick,
    id,
    variant,
    ...props
  }: {
    children: React.ReactNode;
    onClick?: () => void;
    id?: string;
    variant?: string;
    [key: string]: unknown;
  }) => (
    <button id={id} onClick={onClick} data-variant={variant} {...props}>
      {children}
    </button>
  ),
}));

// Mock libs
vi.mock('@/libs', async () => {
  const actual = await vi.importActual('@/libs');
  return {
    ...actual,
    UserRoundPlus: ({ className }: { className?: string }) => (
      <span data-testid="user-round-plus-icon" className={className} />
    ),
  };
});

// Mock app
vi.mock('@/app', () => ({
  AUTH_ROUTES: {
    SIGN_IN: '/sign-in',
  },
}));

describe('HeaderButtonSignIn', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders sign in button with icon and text', () => {
    render(<HeaderButtonSignIn />);

    const button = screen.getByRole('button', { name: /New here?/i });
    expect(button).toBeInTheDocument();
    expect(button).toHaveAttribute('id', 'header-sign-in-btn');
    expect(button).toHaveAttribute('data-variant', 'secondary');
    expect(screen.getByTestId('header-sign-in-btn')).toBeInTheDocument();
  });

  it('navigates to sign in page when clicked', () => {
    render(<HeaderButtonSignIn />);

    const button = screen.getByRole('button', { name: /New here?/i });
    button.click();

    expect(mockPush).toHaveBeenCalledWith('/sign-in');
  });

  it('passes through additional props', () => {
    render(<HeaderButtonSignIn data-testid="custom-button" className="custom-class" />);

    const button = screen.getByTestId('custom-button');
    expect(button).toHaveClass('custom-class');
  });
});

describe('HeaderButtonSignIn - Snapshots', () => {
  it('matches snapshot for default HeaderButtonSignIn', () => {
    const { container } = render(<HeaderButtonSignIn />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with custom className', () => {
    const { container } = render(<HeaderButtonSignIn className="custom-class" />);
    expect(container.firstChild).toMatchSnapshot();
  });
});
