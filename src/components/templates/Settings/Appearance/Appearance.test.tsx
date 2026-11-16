import React from 'react';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Appearance } from './Appearance';

const { mockUseThemePreference } = vi.hoisted(() => ({
  mockUseThemePreference: vi.fn(),
}));

vi.mock('@/hooks/useThemePreference/useThemePreference', () => ({
  useThemePreference: () => mockUseThemePreference(),
}));

describe('Appearance', () => {
  beforeEach(() => {
    mockUseThemePreference.mockReturnValue({ theme: 'system', isReady: true, setTheme: vi.fn() });
  });

  it('renders appearance content', () => {
    render(<Appearance />);
    expect(screen.getByText('Appearance')).toBeInTheDocument();
    expect(screen.getByText('Interface')).toBeInTheDocument();
  });

  it('renders the theme options', () => {
    render(<Appearance />);
    expect(screen.getByRole('radio', { name: 'Dark' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Light' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Auto' })).toBeInTheDocument();
  });
});
