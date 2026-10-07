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
});
