import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SettingsMenu } from './SettingsMenu';

const { isLocksConfigured } = vi.hoisted(() => ({ isLocksConfigured: vi.fn(() => true) }));
vi.mock('@/config/network', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/config/network')>()),
  isLocksConfigured,
}));

describe('SettingsMenu', () => {
  beforeEach(() => {
    isLocksConfigured.mockReturnValue(true);
  });

  it('renders without crashing', () => {
    const { container } = render(<SettingsMenu />);
    expect(container).toBeTruthy();
  });

  it('renders Settings header', () => {
    render(<SettingsMenu />);
    expect(screen.getByText('Settings')).toBeInTheDocument();
  });

  it('renders all menu items', () => {
    render(<SettingsMenu />);

    expect(screen.getByText('Account')).toBeInTheDocument();
    expect(screen.getByText('Notifications')).toBeInTheDocument();
    expect(screen.getByText('Locks')).toBeInTheDocument();
    expect(screen.getByText('Appearance')).toBeInTheDocument();
    expect(screen.getByText('Privacy & Safety')).toBeInTheDocument();
    expect(screen.getByText('Muted Users')).toBeInTheDocument();
    expect(screen.getByText('Help')).toBeInTheDocument();
  });

  it('hides Locks when Locks is not available', () => {
    isLocksConfigured.mockReturnValue(false);
    render(<SettingsMenu />);

    expect(screen.queryByText('Locks')).not.toBeInTheDocument();
    expect(screen.getByText('Notifications')).toBeInTheDocument();
  });
});
