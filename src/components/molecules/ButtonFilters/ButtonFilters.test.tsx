import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ButtonFilters } from './ButtonFilters';

// Mock the atoms
vi.mock('@/atoms/Button/Button', () => {
  return {
    Button: ({
      children,
      onClick,
      className,
      variant,
      size,
      ...props
    }: {
      children: React.ReactNode;
      onClick?: () => void;
      className?: string;
      variant?: string;
      size?: string;
      [key: string]: unknown;
    }) => (
      <button onClick={onClick} className={className} data-variant={variant} data-size={size} {...props}>
        {children}
      </button>
    ),
  };
});

describe('ButtonFilters', () => {
  it('renders with default props', () => {
    render(<ButtonFilters />);
  });

  it('renders with left position by default', () => {
    render(<ButtonFilters />);

    const button = screen.getByRole('button');
    expect(button).toHaveClass('rounded-l-none', 'rounded-r-full');
  });

  it('renders with left position when position is left', () => {
    render(<ButtonFilters position="left" />);

    const button = screen.getByRole('button');
    expect(button).toHaveClass('rounded-l-none', 'rounded-r-full');
  });

  it('renders with right position when position is right', () => {
    render(<ButtonFilters position="right" />);

    const button = screen.getByRole('button');
    expect(button).toHaveClass('rounded-r-none', 'rounded-l-full');
  });

  it('handles click events', () => {
    const mockOnClick = vi.fn();
    render(<ButtonFilters onClick={mockOnClick} />);

    const button = screen.getByRole('button');
    fireEvent.click(button);

    expect(mockOnClick).toHaveBeenCalledTimes(1);
  });

  it('applies correct responsive classes', () => {
    render(<ButtonFilters />);

    const button = screen.getByRole('button');
    expect(button).toHaveClass('hidden', 'lg:inline-flex');
  });

  it('applies correct icon classes', () => {
    render(<ButtonFilters />);

    expect(document.querySelector('.lucide-settings2')).toBeInTheDocument();
  });

  it('handles multiple clicks correctly', () => {
    const mockOnClick = vi.fn();
    render(<ButtonFilters onClick={mockOnClick} />);

    const button = screen.getByRole('button');

    fireEvent.click(button);
    fireEvent.click(button);
    fireEvent.click(button);

    expect(mockOnClick).toHaveBeenCalledTimes(3);
  });

  it('renders with different positions correctly', () => {
    const { rerender } = render(<ButtonFilters position="left" />);

    expect(screen.queryByTestId('lightbulb-icon')).not.toBeInTheDocument();

    rerender(<ButtonFilters position="right" />);

    expect(screen.queryByTestId('settings2-icon')).not.toBeInTheDocument();
  });
});
