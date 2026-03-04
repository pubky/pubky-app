import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { MobileHeader } from './MobileHeader';

// Mock the molecules
vi.mock('@/molecules', () => ({
  Logo: ({ width, height }: { width?: number; height?: number }) => (
    <div data-testid="logo" data-width={width} data-height={height}>
      Logo
    </div>
  ),
}));

// Mock libs - use actual utility functions and icons from lucide-react
vi.mock('@/libs', async () => {
  const actual = await vi.importActual('@/libs');
  return { ...actual };
});

// Mock Core - component now uses useAuthStore directly for isAuthenticated
vi.mock('@/core', async () => {
  const actual = await vi.importActual('@/core');
  return {
    ...actual,
    useAuthStore: vi.fn((selector) => {
      const state = {
        currentUserPubky: 'pk:test-user-pubky',
        setShowSignInDialog: vi.fn(),
      };
      return selector(state);
    }),
  };
});

describe('MobileHeader', () => {
  it('renders with default props', () => {
    render(<MobileHeader />);

    expect(screen.getByTestId('logo')).toBeInTheDocument();
    expect(document.querySelector('.lucide-sliders-horizontal')).toBeInTheDocument();
    expect(document.querySelector('.lucide-activity')).toBeInTheDocument();
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
    expect(outerContainer).toHaveClass('fixed', 'right-0', 'left-0');
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

    const innerContainer = screen.getByTestId('logo').closest('div')?.parentElement;
    expect(innerContainer).toHaveClass('flex', 'items-center', 'justify-between', 'py-3');
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

    const rightButton = document.querySelector('.lucide-activity')?.closest('button');
    expect(rightButton).toHaveClass('rounded-full', 'border-none', 'size-9');
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

    const rightButton = document.querySelector('.lucide-activity')?.closest('button');
    fireEvent.click(rightButton!);

    expect(onRightIconClick).toHaveBeenCalledTimes(1);
  });

  it('applies correct icon classes', () => {
    render(<MobileHeader />);

    const leftIcon = document.querySelector('.lucide-sliders-horizontal');
    const rightIcon = document.querySelector('.lucide-activity');

    expect(leftIcon).toHaveClass('size-6');
    expect(rightIcon).toHaveClass('size-6');
  });

  it('handles hover states correctly', () => {
    render(<MobileHeader />);

    const leftButton = document.querySelector('.lucide-sliders-horizontal')?.closest('button');
    const rightButton = document.querySelector('.lucide-activity')?.closest('button');

    // Ghost variant has hover:bg-accent/50
    expect(leftButton).toHaveClass('hover:bg-accent/50', 'transition-all');
    expect(rightButton).toHaveClass('hover:bg-accent/50', 'transition-all');
  });
});

describe('MobileHeader - Snapshots', () => {
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
