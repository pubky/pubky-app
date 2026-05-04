import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SettingsMobileMenu } from './SettingsMobileMenu';

import { SETTINGS_ROUTES } from '@/app/routes';

// Mock next/navigation
vi.mock('next/navigation', () => ({
  usePathname: () => SETTINGS_ROUTES.ACCOUNT,
  useRouter: () => ({
    push: vi.fn(),
  }),
}));

describe('SettingsMobileMenu', () => {
  it('renders all menu buttons', () => {
    render(<SettingsMobileMenu />);
    expect(screen.getByLabelText('Account')).toBeInTheDocument();
    expect(screen.getByLabelText('Notifications')).toBeInTheDocument();
    expect(screen.getByLabelText('Privacy & Safety')).toBeInTheDocument();
    expect(screen.getByLabelText('Muted Users')).toBeInTheDocument();
    expect(screen.getByLabelText('Language')).toBeInTheDocument();
    expect(screen.getByLabelText('Help')).toBeInTheDocument();
  });

  it('includes lg:hidden class by default', () => {
    const { container } = render(<SettingsMobileMenu />);
    expect(container.firstChild).toHaveClass('lg:hidden');
  });

  it('uses the mobile-menu z-index (consolidated from --z-sticky-header)', () => {
    const { container } = render(<SettingsMobileMenu />);
    const root = container.firstChild as HTMLElement;
    expect(root).toHaveClass('z-(--z-mobile-menu)');
    expect(root).not.toHaveClass('z-(--z-sticky-header)');
  });

  it('preserves fixed positioning', () => {
    const { container } = render(<SettingsMobileMenu />);
    const root = container.firstChild as HTMLElement;
    expect(root).toHaveClass('fixed', 'top-(--header-height-mobile)', 'right-0', 'left-0');
    expect(root).not.toHaveClass('sticky');
  });
});

describe('SettingsMobileMenu - Snapshots', () => {
  it('matches snapshot', () => {
    const { container } = render(<SettingsMobileMenu />);
    expect(container.firstChild).toMatchSnapshot();
  });
});
