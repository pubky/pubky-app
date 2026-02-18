import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Settings } from './Settings';

// Mock next/navigation
vi.mock('next/navigation', () => ({
  usePathname: () => '/settings',
}));

// Mock hooks
vi.mock('@/hooks', () => ({
  useLayoutReset: vi.fn(),
}));

// Mock molecules
vi.mock('@/molecules', () => ({
  MobileHeader: (props: Record<string, unknown>) => <div data-testid="mobile-header" data-fixed={props.fixed} />,
  SettingsMobileMenu: () => <div data-testid="settings-mobile-menu" />,
  SettingsMenu: () => <div data-testid="settings-menu" />,
  SettingsInfo: (props: Record<string, unknown>) => <div data-testid="settings-info" data-hide-faq={props.hideFAQ} />,
}));

// Mock organisms
vi.mock('@/organisms', () => ({
  ContentLayout: (props: Record<string, unknown>) => (
    <div data-testid="content-layout" className={props.className as string}>
      {props.children as React.ReactNode}
      {props.rightSidebarContent as React.ReactNode}
      {props.rightDrawerContent as React.ReactNode}
    </div>
  ),
}));

describe('Settings', () => {
  it('applies correct padding to ContentLayout', () => {
    render(
      <Settings>
        <div />
      </Settings>,
    );
    expect(screen.getByTestId('content-layout')).toHaveClass('pt-40', 'lg:pt-0');
  });
});

// Snapshot as a sanity check: guards overall composition structure (mocked children, props wiring)
describe('Settings - Snapshots', () => {
  it('matches snapshot', () => {
    const { container } = render(
      <Settings>
        <div>Settings content</div>
      </Settings>,
    );
    expect(container.innerHTML).toMatchSnapshot();
  });
});
