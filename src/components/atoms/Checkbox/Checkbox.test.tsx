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

describe('Checkbox - Snapshots', () => {
  it('matches snapshot with default props', () => {
    const { container } = render(<Checkbox />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot when checked', () => {
    const { container } = render(<Checkbox checked={true} />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot when unchecked', () => {
    const { container } = render(<Checkbox checked={false} />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot when disabled', () => {
    const { container } = render(<Checkbox disabled />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot when disabled and checked', () => {
    const { container } = render(<Checkbox disabled checked={true} />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with label', () => {
    const { container } = render(<Checkbox label="Test label" />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with label and description', () => {
    const { container } = render(<Checkbox label="Label" description="Description text" />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with label, description and checked', () => {
    const { container } = render(<Checkbox label="Checked label" description="Description text" checked={true} />);
    expect(container.firstChild).toMatchSnapshot();
  });
});
