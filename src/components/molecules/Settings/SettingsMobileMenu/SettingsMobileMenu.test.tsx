import React from 'react';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SETTINGS_ROUTES } from '@/app/routes';
import { SettingsMobileMenu } from './SettingsMobileMenu';

const { isLocksConfigured } = vi.hoisted(() => ({ isLocksConfigured: vi.fn(() => true) }));
vi.mock('@/config/network', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/config/network')>()),
  isLocksConfigured,
}));

// Mock next/navigation
vi.mock('next/navigation', () => ({
  usePathname: () => SETTINGS_ROUTES.ACCOUNT,
  useRouter: () => ({
    push: vi.fn(),
  }),
}));

describe('SettingsMobileMenu', () => {
  beforeEach(() => {
    isLocksConfigured.mockReturnValue(true);
  });

  it('renders all menu buttons', () => {
    render(<SettingsMobileMenu />);
    expect(screen.getByLabelText('Account')).toBeInTheDocument();
    expect(screen.getByLabelText('Notifications')).toBeInTheDocument();
    expect(screen.getByLabelText('Locks')).toBeInTheDocument();
    expect(screen.getByLabelText('Appearance')).toBeInTheDocument();
    expect(screen.getByLabelText('Privacy & Safety')).toBeInTheDocument();
    expect(screen.getByLabelText('Muted Users')).toBeInTheDocument();
    expect(screen.getByLabelText('Help')).toBeInTheDocument();
  });

  it('hides Locks when Locks is not available', () => {
    isLocksConfigured.mockReturnValue(false);
    render(<SettingsMobileMenu />);

    expect(screen.queryByLabelText('Locks')).not.toBeInTheDocument();
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
    expect(root).toHaveClass('fixed', 'top-(--header-height-settings)', 'right-0', 'left-0');
    expect(root).not.toHaveClass('sticky');
  });
});
