import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { Settings } from './Settings';

vi.mock('next/navigation', () => ({
  usePathname: () => '/settings/account',
}));

vi.mock('@/hooks', () => ({
  useLayoutReset: vi.fn(),
}));

vi.mock('@/molecules', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/molecules')>();
  return {
    ...actual,
    MobileHeader: () => <div data-testid="mobile-header" />,
    SettingsMobileMenu: ({ className }: { className?: string }) => (
      <div data-testid="settings-mobile-menu" className={className} />
    ),
    SettingsMenu: () => <div data-testid="settings-menu" />,
    SettingsInfo: () => <div data-testid="settings-info" />,
  };
});

vi.mock('@/organisms', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/organisms')>();
  return {
    ...actual,
    ContentLayout: ({ children }: { children: React.ReactNode }) => <div data-testid="content-layout">{children}</div>,
  };
});

describe('Settings', () => {
  it('renders without crashing', () => {
    const { container } = render(
      <Settings>
        <div>Test content</div>
      </Settings>,
    );
    expect(container).toBeTruthy();
  });

  it('renders children content', () => {
    render(
      <Settings>
        <div>Test content</div>
      </Settings>,
    );
    expect(screen.getByText('Test content')).toBeInTheDocument();
  });

  it('renders mobile header', () => {
    render(
      <Settings>
        <div>Test content</div>
      </Settings>,
    );
    expect(screen.getByTestId('mobile-header')).toBeInTheDocument();
  });

  it('renders mobile menu', () => {
    render(
      <Settings>
        <div>Test content</div>
      </Settings>,
    );
    expect(screen.getByTestId('settings-mobile-menu')).toBeInTheDocument();
  });
});

describe('Settings - Snapshots', () => {
  it('matches snapshot', () => {
    const { container } = render(
      <Settings>
        <div>Test content</div>
      </Settings>,
    );
    expect(container.firstChild).toMatchSnapshot();
  });
});
