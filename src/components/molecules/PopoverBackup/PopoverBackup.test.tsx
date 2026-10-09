import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PopoverBackup } from './PopoverBackup';

// The popover opens on hover, which the atom disables on touch devices.
vi.mock('@/hooks/useIsTouchDevice/useIsTouchDevice', () => ({
  useIsTouchDevice: () => false,
}));

describe('PopoverBackup', () => {
  it('renders a help trigger and keeps the explanation closed until hovered', () => {
    render(<PopoverBackup />);

    expect(screen.getByTestId('circle-help-icon')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Why is this important?' })).not.toBeInTheDocument();
  });

  it('shows the backup explanation on hover', () => {
    render(<PopoverBackup />);

    fireEvent.mouseEnter(screen.getByRole('button'));

    expect(screen.getByRole('heading', { name: 'Why is this important?' })).toBeInTheDocument();
    expect(screen.getByText(/The secret seed for your pubky is like a master password/)).toBeInTheDocument();
  });

  it('merges className onto the trigger button', () => {
    render(<PopoverBackup className="custom-backup-style" />);

    expect(screen.getByRole('button')).toHaveClass('custom-backup-style');
  });
});
