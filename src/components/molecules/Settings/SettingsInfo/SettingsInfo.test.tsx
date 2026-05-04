import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { SettingsInfo } from './SettingsInfo';

vi.mock('@/config/app', () => ({
  APP_VERSION: '1.2.3',
}));

vi.mock('@/config/externalLinks', () => ({
  APP_RELEASE_URL: 'https://github.com/pubky/pubky-app/releases/tag/1.2.3',
}));

describe('SettingsInfo', () => {
  it('renders without crashing', () => {
    const { container } = render(<SettingsInfo />);
    expect(container).toBeTruthy();
  });

  it('renders all section headers', () => {
    render(<SettingsInfo />);

    expect(screen.getByText('Terms of Service & Privacy')).toBeInTheDocument();
    expect(screen.getByText('FAQ')).toBeInTheDocument();
  });

  it('renders subtitle for Terms section', () => {
    render(<SettingsInfo />);
    expect(screen.getByText('Please read our terms carefully.')).toBeInTheDocument();
  });

  it('renders version section with title and version number', () => {
    render(<SettingsInfo />);
    expect(screen.getByText('Version')).toBeInTheDocument();
    expect(screen.getByText('v1.2.3')).toBeInTheDocument();
  });

  it('renders version link pointing to release URL', () => {
    render(<SettingsInfo />);
    const versionLink = screen.getByText('v1.2.3').closest('a');
    expect(versionLink).toHaveAttribute('href', 'https://github.com/pubky/pubky-app/releases/tag/1.2.3');
    expect(versionLink).toHaveAttribute('target', '_blank');
  });

  it('renders copyright text', () => {
    render(<SettingsInfo />);
    expect(screen.getByText(new RegExp(`© ${new Date().getFullYear()} Synonym Software`))).toBeInTheDocument();
  });
});

describe('SettingsInfo - Snapshots', () => {
  it('matches snapshot', () => {
    const { container } = render(<SettingsInfo />);
    expect(container).toMatchSnapshot();
  });
});
