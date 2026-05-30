import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Settings } from './Settings';

vi.mock('next/navigation', () => ({
  usePathname: () => '/settings/account',
}));

vi.mock('@/molecules/MobileHeader/MobileHeader', () => {
  return {
    MobileHeader: () => <div data-testid="mobile-header" />,
  };
});

vi.mock('@/molecules/Settings/SettingsInfo/SettingsInfo', () => {
  return {
    SettingsInfo: () => <div data-testid="settings-info" />,
  };
});

vi.mock('@/molecules/Settings/SettingsMenu/SettingsMenu', () => {
  return {
    SettingsMenu: () => <div data-testid="settings-menu" />,
  };
});

vi.mock('@/molecules/Settings/SettingsMobileMenu/SettingsMobileMenu', () => {
  return {
    SettingsMobileMenu: ({ className }: { className?: string }) => (
      <div data-testid="settings-mobile-menu" className={className} />
    ),
  };
});

vi.mock('@/organisms/ContentLayout/ContentLayout', () => {
  return {
    ContentLayout: ({
      children,
      disableWideShellLayout,
    }: {
      children: React.ReactNode;
      disableWideShellLayout?: boolean;
    }) => (
      <div data-testid="content-layout" data-disable-wide-shell-layout={String(disableWideShellLayout)}>
        {children}
      </div>
    ),
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

  it('disables wide shell layout without resetting the saved feed preference', () => {
    render(
      <Settings>
        <div>Test content</div>
      </Settings>,
    );

    expect(screen.getByTestId('content-layout')).toHaveAttribute('data-disable-wide-shell-layout', 'true');
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
