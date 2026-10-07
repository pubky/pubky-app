import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Checkbox } from './Checkbox';

describe('Checkbox', () => {
  it('renders with default props', () => {
    render(<Checkbox />);
    const checkbox = screen.getByRole('checkbox');
    expect(checkbox).toBeInTheDocument();
  });

  it('handles onCheckedChange callback', () => {
    const handleChange = vi.fn();
    render(<Checkbox onCheckedChange={handleChange} />);

    const checkbox = screen.getByRole('checkbox');
    fireEvent.click(checkbox);

    expect(handleChange).toHaveBeenCalledTimes(1);
  });

  it('clicking label toggles checkbox', () => {
    const handleChange = vi.fn();
    render(<Checkbox label="Toggle me" onCheckedChange={handleChange} />);

    const label = screen.getByText('Toggle me');
    fireEvent.click(label);

    expect(handleChange).toHaveBeenCalledTimes(1);
  });
});
