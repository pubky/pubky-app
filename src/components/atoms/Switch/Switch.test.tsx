import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Switch } from './Switch';

describe('Switch', () => {
  it('renders with default props', () => {
    render(<Switch />);
    const switchElement = screen.getByRole('switch');
    expect(switchElement).toBeInTheDocument();
  });

  it('handles checked state', () => {
    render(<Switch checked={true} />);
    const switchElement = screen.getByRole('switch');
    expect(switchElement).toHaveAttribute('data-state', 'checked');
  });

  it('handles unchecked state', () => {
    render(<Switch checked={false} />);
    const switchElement = screen.getByRole('switch');
    expect(switchElement).toHaveAttribute('data-state', 'unchecked');
  });

  it('handles onCheckedChange callback', () => {
    const handleChange = vi.fn();
    render(<Switch onCheckedChange={handleChange} />);

    const switchElement = screen.getByRole('switch');
    fireEvent.click(switchElement);

    expect(handleChange).toHaveBeenCalledTimes(1);
  });

  it('can be disabled', () => {
    render(<Switch disabled />);
    const switchElement = screen.getByRole('switch');
    expect(switchElement).toBeDisabled();
  });
});

describe('Switch - Snapshots', () => {
  it('matches snapshot with default props', () => {
    const { container } = render(<Switch />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot when checked', () => {
    const { container } = render(<Switch checked={true} />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot when unchecked', () => {
    const { container } = render(<Switch checked={false} />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot when disabled', () => {
    const { container } = render(<Switch disabled />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot when disabled and checked', () => {
    const { container } = render(<Switch disabled checked={true} />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with custom className', () => {
    const { container } = render(<Switch className="custom-switch" />);
    expect(container.firstChild).toMatchSnapshot();
  });
});
