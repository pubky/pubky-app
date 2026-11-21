import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SETTINGS_ROUTES } from '@/app/routes';
import LocksSettingsPage from './page';

const mocks = vi.hoisted(() => ({
  isLocksConfigured: vi.fn(() => true),
  redirect: vi.fn((): never => {
    throw new Error('NEXT_REDIRECT');
  }),
}));

vi.mock('next/navigation', () => ({ redirect: mocks.redirect }));
vi.mock('@/config/network', () => ({ isLocksConfigured: mocks.isLocksConfigured }));
vi.mock('@/templates/Settings/Locks/Locks', () => ({ Locks: () => <div data-testid="locks-template" /> }));

describe('Locks settings page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.isLocksConfigured.mockReturnValue(true);
  });

  it('renders the Locks settings where Locks is configured', () => {
    render(<LocksSettingsPage />);

    expect(screen.getByTestId('locks-template')).toBeInTheDocument();
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it('redirects to Account where Locks is not configured', () => {
    mocks.isLocksConfigured.mockReturnValue(false);

    expect(() => render(<LocksSettingsPage />)).toThrow('NEXT_REDIRECT');
    expect(mocks.redirect).toHaveBeenCalledWith(SETTINGS_ROUTES.ACCOUNT);
  });
});
