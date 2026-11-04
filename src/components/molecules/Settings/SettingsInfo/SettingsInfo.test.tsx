import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { LEGAL_ROUTES } from '@/app/routes';
import { SettingsInfo } from './SettingsInfo';

vi.mock('@/config/app', () => ({
  APP_VERSION: '1.2.3',
}));

vi.mock('@/config/externalLinks', () => ({
  APP_RELEASE_URL: 'https://github.com/pubky/pubky-app/releases/tag/v1.2.3',
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

  it('links Terms of service and Privacy policy to their pages in the same tab', () => {
    render(<SettingsInfo />);

    const terms = screen.getByRole('link', { name: 'Terms of service' });
    expect(terms).toHaveAttribute('href', LEGAL_ROUTES.TERMS_OF_USE);
    expect(terms).not.toHaveAttribute('target');
    const privacy = screen.getByRole('link', { name: 'Privacy policy' });
    expect(privacy).toHaveAttribute('href', LEGAL_ROUTES.PRIVACY_POLICY);
    expect(privacy).not.toHaveAttribute('target');
  });

  it.each(['Terms of service', 'Privacy policy', 'More FAQ'])(
    'renders %s as one link with its icon, not a button inside a link',
    (name) => {
      render(<SettingsInfo />);

      const link = screen.getByRole('link', { name });
      expect(link.querySelector('svg')).toBeInTheDocument();
      expect(link.querySelector('button')).not.toBeInTheDocument();
      expect(link.closest('button')).not.toBeInTheDocument();
    },
  );

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
    expect(versionLink).toHaveAttribute('href', 'https://github.com/pubky/pubky-app/releases/tag/v1.2.3');
    expect(versionLink).toHaveAttribute('target', '_blank');
  });

  it('renders copyright text', () => {
    render(<SettingsInfo />);
    expect(screen.getByText(new RegExp(`© ${new Date().getFullYear()} Synonym Software`))).toBeInTheDocument();
  });
});
