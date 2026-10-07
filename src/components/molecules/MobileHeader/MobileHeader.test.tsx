import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MobileHeader } from './MobileHeader';

let mockCurrentUserPubky: string | null = 'pk:test-user-pubky';
let mockIsCoreExploreRoute = false;
let mockIsPublicExploreRoute = false;
const mockSetShowSignInDialog = vi.fn();

// Mock the molecules
vi.mock('@/molecules/Logo/Logo', () => {
  return {
    Logo: ({ width, height }: { width?: number; height?: number }) => (
      <div data-testid="logo" data-width={width} data-height={height}>
        Logo
      </div>
    ),
  };
});

// Mock auth store - component uses useAuthStore directly for isAuthenticated
vi.mock('@/stores/auth/auth.store', () => ({
  useAuthStore: vi.fn((selector) => {
    const state = {
      currentUserPubky: mockCurrentUserPubky,
      setShowSignInDialog: mockSetShowSignInDialog,
    };
    return selector(state);
  }),
}));

vi.mock('@/hooks/usePublicRoute/usePublicRoute', () => ({
  usePublicRoute: vi.fn(() => ({
    isPublicRoute: false,
    isDynamicPublicRoute: false,
    isCoreExploreRoute: mockIsCoreExploreRoute,
    isPublicExploreRoute: mockIsPublicExploreRoute,
  })),
}));

describe('MobileHeader', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCurrentUserPubky = 'pk:test-user-pubky';
    mockIsCoreExploreRoute = false;
    mockIsPublicExploreRoute = false;
  });

  it('renders with default props', () => {
    render(<MobileHeader />);

    expect(screen.getByTestId('logo')).toBeInTheDocument();
    expect(document.querySelector('.lucide-sliders-horizontal')).toBeInTheDocument();
    expect(document.querySelector('.lucide-lightbulb')).toBeInTheDocument();
  });

  it('renders with outer container classes', () => {
    const { container } = render(<MobileHeader />);
    const outerContainer = container.firstChild as HTMLElement;
    expect(outerContainer).toHaveClass(
      'sticky',
      'top-0',
      'z-(--z-mobile-menu)',
      'bg-linear-to-b',
      'from-(--background)',
      'from-35%',
      'to-transparent',
      'lg:hidden',
    );
  });

  it('renders with solid background when hasGradientBackground is false', () => {
    const { container } = render(<MobileHeader hasGradientBackground={false} />);
    const outerContainer = container.firstChild as HTMLElement;
    expect(outerContainer).toHaveClass(
      'sticky',
      'top-0',
      'z-(--z-mobile-menu)',
      'lg:hidden',
      'bg-background',
      'shadow-xs',
    );
    expect(outerContainer).not.toHaveClass('bg-linear-to-b');
  });

  it('uses fixed positioning when fixed prop is true', () => {
    const { container } = render(<MobileHeader fixed />);
    const outerContainer = container.firstChild as HTMLElement;
    expect(outerContainer).toHaveClass('fixed', 'inset-x-0');
    expect(outerContainer).not.toHaveClass('sticky');
  });

  it('renders with custom onLeftIconClick', () => {
    const mockOnLeftIconClick = vi.fn();
    render(<MobileHeader onLeftIconClick={mockOnLeftIconClick} />);

    const leftButton = document.querySelector('.lucide-sliders-horizontal')?.closest('button');
    fireEvent.click(leftButton!);

    expect(mockOnLeftIconClick).toHaveBeenCalledTimes(1);
  });

  it('applies correct classes to container', () => {
    render(<MobileHeader />);

    expect(screen.getByTestId('logo')).toBeInTheDocument();
  });

  it('applies correct classes to inner container', () => {
    render(<MobileHeader />);

    const innerContainer = screen.getByTestId('logo').parentElement;
    expect(innerContainer).toHaveClass('flex', 'w-full', 'items-center', 'justify-between', 'px-4', 'py-6');
    expect(innerContainer).not.toHaveClass('p-6');
  });

  it('preserves 24px top padding when the bottom padding is removed', () => {
    render(<MobileHeader containerClassName="pb-0" />);

    const innerContainer = screen.getByTestId('logo').parentElement;
    expect(innerContainer).toHaveClass('px-4', 'py-6', 'pb-0');
    expect(innerContainer).not.toHaveClass('p-6');
  });

  it('applies correct classes to left button', () => {
    render(<MobileHeader />);

    const leftButton = document.querySelector('.lucide-sliders-horizontal')?.closest('button');
    expect(leftButton).toHaveClass('rounded-full', 'border-none', 'size-9');
    expect(leftButton).toHaveAttribute('data-variant', 'ghost');
    expect(leftButton).toHaveAttribute('data-size', 'icon');
  });

  it('applies correct classes to right button', () => {
    render(<MobileHeader />);

    const rightButton = document.querySelector('.lucide-lightbulb')?.closest('button');
    expect(rightButton).toHaveClass('rounded-full', 'border-none', 'size-12', 'shrink-0');
    expect(rightButton).toHaveAttribute('data-variant', 'ghost');
    expect(rightButton).toHaveAttribute('data-size', 'icon');
  });

  it('renders logo component', () => {
    render(<MobileHeader />);

    const logo = screen.getByTestId('logo');
    expect(logo).toBeInTheDocument();
  });

  it('calls onRightIconClick when right button is clicked', () => {
    const onRightIconClick = vi.fn();
    render(<MobileHeader onRightIconClick={onRightIconClick} />);

    fireEvent.click(screen.getByRole('button', { name: 'Open right panel' }));

    expect(onRightIconClick).toHaveBeenCalledTimes(1);
  });

  it('labels the right button by its authenticated action', () => {
    render(<MobileHeader />);

    expect(screen.getByRole('button', { name: 'Open right panel' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Join Pubky' })).not.toBeInTheDocument();
  });

  it('applies correct icon classes', () => {
    render(<MobileHeader />);

    const leftIcon = document.querySelector('.lucide-sliders-horizontal');
    const rightIcon = document.querySelector('.lucide-lightbulb');

    expect(leftIcon).toHaveClass('size-6');
    expect(rightIcon).toHaveClass('size-6');
  });

  it('handles hover states correctly', () => {
    render(<MobileHeader />);

    const leftButton = document.querySelector('.lucide-sliders-horizontal')?.closest('button');
    const rightButton = document.querySelector('.lucide-lightbulb')?.closest('button');

    // Ghost variant has hover:bg-accent/50
    expect(leftButton).toHaveClass('hover:bg-accent/50', 'transition-all');
    expect(rightButton).toHaveClass('hover:bg-accent/50', 'transition-all');
  });

  it('shows filter and join buttons when unauthenticated on a core explore route', () => {
    mockCurrentUserPubky = null;
    mockIsCoreExploreRoute = true;
    mockIsPublicExploreRoute = true;

    render(<MobileHeader />);

    expect(document.querySelector('.lucide-sliders-horizontal')).toBeInTheDocument();
    expect(document.querySelector('.lucide-lightbulb')).toBeInTheDocument();
  });

  it('shows filter button when unauthenticated on a post page (public explore)', () => {
    mockCurrentUserPubky = null;
    mockIsCoreExploreRoute = false;
    mockIsPublicExploreRoute = true;

    render(<MobileHeader onLeftIconClick={vi.fn()} />);

    expect(document.querySelector('.lucide-sliders-horizontal')).toBeInTheDocument();
  });

  it('hides filter button when unauthenticated off explore routes', () => {
    mockCurrentUserPubky = null;
    mockIsPublicExploreRoute = false;

    render(<MobileHeader />);

    expect(document.querySelector('.lucide-sliders-horizontal')).not.toBeInTheDocument();
  });

  it('opens sign-in dialog from right header button when unauthenticated', () => {
    mockCurrentUserPubky = null;

    render(<MobileHeader />);

    fireEvent.click(screen.getByRole('button', { name: 'Join Pubky' }));

    expect(mockSetShowSignInDialog).toHaveBeenCalledWith(true);
  });
});

describe('MobileHeader - Snapshots', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCurrentUserPubky = 'pk:test-user-pubky';
    mockIsCoreExploreRoute = false;
    mockIsPublicExploreRoute = false;
  });

  it('matches snapshot with default props', () => {
    const { container } = render(<MobileHeader />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with solid background (hasGradientBackground=false)', () => {
    const { container } = render(<MobileHeader hasGradientBackground={false} />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with fixed positioning', () => {
    const { container } = render(<MobileHeader fixed />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with custom onLeftIconClick', () => {
    const mockOnLeftIconClick = vi.fn();
    const { container } = render(<MobileHeader onLeftIconClick={mockOnLeftIconClick} />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot for left button', () => {
    render(<MobileHeader />);

    // Icons are now actual lucide-react components (SVGs), find buttons by position
    const buttons = screen.getAllByRole('button');
    const leftButton = buttons[0];
    expect(leftButton).toMatchSnapshot();
  });

  it('matches snapshot for right button', () => {
    render(<MobileHeader />);

    // Icons are now actual lucide-react components (SVGs), find buttons by position
    const buttons = screen.getAllByRole('button');
    const rightButton = buttons[1];
    expect(rightButton).toMatchSnapshot();
  });

  it('matches snapshot for logo', () => {
    render(<MobileHeader />);

    const logo = screen.getByTestId('logo');
    expect(logo).toMatchSnapshot();
  });
});
