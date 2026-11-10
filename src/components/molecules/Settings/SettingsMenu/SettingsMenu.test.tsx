import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { isPinakesConfigured } from '@/config/pinakes';
import { SettingsMenu } from './SettingsMenu';

vi.mock('@/config/pinakes', () => ({ isPinakesConfigured: vi.fn(() => true) }));

describe('SettingsMenu', () => {
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
    expect(screen.getByText('Appearance')).toBeInTheDocument();
    expect(screen.getByText('Privacy & Safety')).toBeInTheDocument();
    expect(screen.getByText('Links & Media')).toBeInTheDocument();
    expect(screen.getByText('Muted Users')).toBeInTheDocument();
    expect(screen.getByText('Help')).toBeInTheDocument();
  });

  describe('without Pinakes', () => {
    afterEach(() => vi.mocked(isPinakesConfigured).mockReturnValue(true));

    it('leaves out Links & Media', () => {
      vi.mocked(isPinakesConfigured).mockReturnValue(false);
      render(<SettingsMenu />);

      expect(screen.queryByText('Links & Media')).not.toBeInTheDocument();
      expect(screen.getByText('Privacy & Safety')).toBeInTheDocument();
    });
  });
});
