import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SettingsSwitchItem } from './SettingsSwitchItem';

describe('SettingsSwitchItem', () => {
  const defaultProps = {
    id: 'test-switch',
    label: 'Test Setting',
    checked: false,
  };

  it('renders with required props', () => {
    render(<SettingsSwitchItem {...defaultProps} />);

    expect(screen.getByText('Test Setting')).toBeInTheDocument();
    expect(screen.getByRole('switch')).toBeInTheDocument();
  });

  it('handles checked state', () => {
    render(<SettingsSwitchItem {...defaultProps} checked={true} />);
    const switchElement = screen.getByRole('switch');
    expect(switchElement).toHaveAttribute('data-state', 'checked');
  });

  it('handles onChange callback', () => {
    const handleChange = vi.fn();
    render(<SettingsSwitchItem {...defaultProps} onChange={handleChange} />);

    const switchElement = screen.getByRole('switch');
    fireEvent.click(switchElement);

    expect(handleChange).toHaveBeenCalledTimes(1);
  });

  it('derives data-cy hooks for the switch and its label from the id', () => {
    render(<SettingsSwitchItem {...defaultProps} />);

    expect(screen.getByRole('switch')).toHaveAttribute('data-cy', 'test-switch');
    expect(screen.getByText('Test Setting')).toHaveAttribute('data-cy', 'test-switch-label');
  });

  it('toggles when the label is clicked', () => {
    const handleChange = vi.fn();
    render(<SettingsSwitchItem {...defaultProps} onChange={handleChange} />);

    fireEvent.click(screen.getByText('Test Setting'));

    expect(handleChange).toHaveBeenCalledTimes(1);
  });

  it('can be disabled', () => {
    render(<SettingsSwitchItem {...defaultProps} disabled />);
    const switchElement = screen.getByRole('switch');
    expect(switchElement).toBeDisabled();
  });
});
