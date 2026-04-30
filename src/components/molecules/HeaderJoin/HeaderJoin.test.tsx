import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { HeaderJoin } from './HeaderJoin';

// Mock auth store
const mockSetShowSignInDialog = vi.fn();
vi.mock('@/stores/auth/auth.store', () => ({
  useAuthStore: (selector: (state: { setShowSignInDialog: typeof mockSetShowSignInDialog }) => unknown) =>
    selector({ setShowSignInDialog: mockSetShowSignInDialog }),
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
  Button: ({
    children,
    onClick,
    'aria-label': ariaLabel,
    'data-testid': testId,
    ...props
  }: {
    children: React.ReactNode;
    onClick?: () => void;
    'aria-label'?: string;
    'data-testid'?: string;
    [key: string]: unknown;
  }) => (
    <button onClick={onClick} aria-label={ariaLabel} data-testid={testId} {...props}>
      {children}
    </button>
  ),
}));

describe('HeaderJoin', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders join button with icon', () => {
    render(<HeaderJoin />);

    const joinButton = screen.getByTestId('header-join-button');
    expect(joinButton).toBeInTheDocument();
    expect(joinButton.querySelector('.lucide-user-round')).toBeInTheDocument();
  });

  it('has correct aria-label for accessibility', () => {
    render(<HeaderJoin />);

    expect(screen.getByTestId('header-join-button')).toHaveAttribute('aria-label', 'Join Pubky');
  });

  it('calls setShowSignInDialog when clicked', () => {
    render(<HeaderJoin />);

    fireEvent.click(screen.getByTestId('header-join-button'));

    expect(mockSetShowSignInDialog).toHaveBeenCalledTimes(1);
    expect(mockSetShowSignInDialog).toHaveBeenCalledWith(true);
  });

  it('applies correct container classes', () => {
    const { container } = render(<HeaderJoin />);
    const containerElement = container.firstChild as HTMLElement;

    expect(containerElement).toHaveClass('flex-1', 'flex-row', 'items-center', 'justify-end');
  });
});

describe('HeaderJoin - Snapshots', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('matches snapshot for default HeaderJoin', () => {
    const { container } = render(<HeaderJoin />);
    expect(container.firstChild).toMatchSnapshot();
  });
});
