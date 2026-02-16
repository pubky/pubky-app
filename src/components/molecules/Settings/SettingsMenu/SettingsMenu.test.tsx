import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { SettingsMenu } from './SettingsMenu';

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
    expect(screen.getByText('Privacy & Safety')).toBeInTheDocument();
    expect(screen.getByText('Muted Users')).toBeInTheDocument();
    expect(screen.getByText('Language')).toBeInTheDocument();
    expect(screen.getByText('Help')).toBeInTheDocument();
  });
});

describe('SettingsMenu - Snapshots', () => {
  it('matches snapshot', () => {
    const { container } = render(<SettingsMenu />);
    expect(container).toMatchSnapshot();
  });
});
