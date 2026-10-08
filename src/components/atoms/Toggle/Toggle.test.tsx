import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Toggle } from './Toggle';

describe('Toggle', () => {
  it('renders with default props', () => {
    render(<Toggle>Toggle</Toggle>);

    const toggle = screen.getByRole('button');
    expect(toggle).toBeInTheDocument();
    expect(toggle).toHaveTextContent('Toggle');
  });

  it('handles click events', () => {
    const handleClick = vi.fn();
    render(<Toggle onClick={handleClick}>Toggle</Toggle>);

    const toggle = screen.getByRole('button');
    fireEvent.click(toggle);

    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it('forwards ref correctly', () => {
    const ref = vi.fn();
    render(<Toggle ref={ref}>Toggle</Toggle>);

    expect(ref).toHaveBeenCalled();
  });

  it('applies the default variant and size without props', () => {
    render(<Toggle>Default</Toggle>);

    const toggle = screen.getByRole('button');
    expect(toggle).toHaveClass('h-9', 'px-2', 'min-w-9');
    expect(toggle).not.toHaveClass('border', 'border-input');
  });

  it('applies the outline variant', () => {
    render(<Toggle variant="outline">Outline</Toggle>);
    expect(screen.getByRole('button')).toHaveClass('border', 'border-input', 'shadow-sm');
  });

  it.each([
    ['sm', ['h-8', 'px-1.5', 'min-w-8']],
    ['default', ['h-9', 'px-2', 'min-w-9']],
    ['lg', ['h-10', 'px-2.5', 'min-w-10']],
  ] as const)('applies size=%s classes', (size, classNames) => {
    render(<Toggle size={size}>Sized</Toggle>);
    expect(screen.getByRole('button')).toHaveClass(...classNames);
  });

  it('reflects the pressed state', () => {
    render(<Toggle pressed>Pressed</Toggle>);

    const toggle = screen.getByRole('button');
    expect(toggle).toHaveAttribute('aria-pressed', 'true');
    expect(toggle).toHaveAttribute('data-state', 'on');
  });

  it('renders disabled', () => {
    render(<Toggle disabled>Disabled</Toggle>);
    expect(screen.getByRole('button')).toBeDisabled();
  });

  it('merges a custom className with the variant classes', () => {
    render(
      <Toggle variant="outline" size="lg" className="custom-class">
        Combined
      </Toggle>,
    );
    expect(screen.getByRole('button')).toHaveClass('custom-class', 'border-input', 'h-10');
  });
});
