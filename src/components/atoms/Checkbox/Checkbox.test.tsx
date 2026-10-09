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

  it('renders the description below the label', () => {
    render(<Checkbox label="Notify me" description="Send a weekly summary" />);

    expect(screen.getByLabelText('Notify me')).toBeInTheDocument();
    expect(screen.getByText('Send a weekly summary')).toHaveClass('text-sm', 'text-muted-foreground');
  });

  it('reflects the checked state', () => {
    render(<Checkbox checked onCheckedChange={() => {}} />);

    const checkbox = screen.getByRole('checkbox');
    expect(checkbox).toHaveAttribute('aria-checked', 'true');
    expect(checkbox).toHaveAttribute('data-state', 'checked');
    expect(checkbox).toHaveClass('data-[state=checked]:bg-brand');
  });

  it('renders disabled and ignores clicks', () => {
    const handleChange = vi.fn();
    render(<Checkbox label="Locked" disabled onCheckedChange={handleChange} />);

    const checkbox = screen.getByRole('checkbox');
    expect(checkbox).toBeDisabled();
    expect(checkbox).toHaveAttribute('data-disabled');

    fireEvent.click(screen.getByText('Locked'));
    expect(handleChange).not.toHaveBeenCalled();
  });

  it('stays checked while disabled', () => {
    render(<Checkbox disabled checked onCheckedChange={() => {}} />);

    const checkbox = screen.getByRole('checkbox');
    expect(checkbox).toBeDisabled();
    expect(checkbox).toHaveAttribute('aria-checked', 'true');
  });

  it('merges a custom className', () => {
    render(<Checkbox className="custom-class" />);
    expect(screen.getByRole('checkbox')).toHaveClass('custom-class', 'h-4', 'w-4', 'rounded');
  });
});
