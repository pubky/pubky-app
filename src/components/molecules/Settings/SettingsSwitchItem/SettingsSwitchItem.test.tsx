import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
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

  it('can be disabled', () => {
    render(<SettingsSwitchItem {...defaultProps} disabled />);
    const switchElement = screen.getByRole('switch');
    expect(switchElement).toBeDisabled();
  });
});

describe('SettingsSwitchItem - Snapshots', () => {
  const defaultProps = {
    id: 'test-switch',
    label: 'Test Setting',
    checked: false,
  };

  it('matches snapshot with default props', () => {
    const { container } = render(<SettingsSwitchItem {...defaultProps} />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot when checked', () => {
    const { container } = render(<SettingsSwitchItem {...defaultProps} checked={true} />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot when disabled', () => {
    const { container } = render(<SettingsSwitchItem {...defaultProps} disabled />);
    expect(container.firstChild).toMatchSnapshot();
  });
});
