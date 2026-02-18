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
  MobileHeader: () => <div data-testid="mobile-header" />,
  SettingsMobileMenu: () => <div data-testid="settings-mobile-menu" />,
  SettingsMenu: () => <div data-testid="settings-menu" />,
  SettingsInfo: () => <div data-testid="settings-info" />,
}));

// Mock organisms
vi.mock('@/organisms', () => ({
  ContentLayout: (props: Record<string, unknown>) => (
    <div data-testid="content-layout" className={props.className as string}>
      {props.children as React.ReactNode}
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
