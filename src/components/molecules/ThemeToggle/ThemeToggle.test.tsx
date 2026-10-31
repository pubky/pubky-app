import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ThemeToggle } from './ThemeToggle';

const mockSetTheme = vi.fn();

vi.mock('@/hooks/useThemePreference/useThemePreference', () => ({
  useThemePreference: () => ({ theme: 'system', isReady: true, setTheme: mockSetTheme }),
}));

describe('ThemeToggle', () => {
  beforeEach(() => {
    mockSetTheme.mockClear();
  });

  it('offers a switch to light mode from the dark appearance', () => {
    render(<ThemeToggle />);

    const toLight = screen.getByRole('button', { name: 'Switch to light mode' });
    expect(toLight).toHaveClass('[.light_&]:hidden');
    expect(screen.getByRole('button', { name: 'Switch to dark mode' })).toHaveClass('hidden');

    fireEvent.click(toLight);

    expect(mockSetTheme).toHaveBeenCalledWith('light');
  });

  it('offers a switch to dark mode from the light appearance', () => {
    render(<ThemeToggle />);

    fireEvent.click(screen.getByRole('button', { name: 'Switch to dark mode' }));

    expect(mockSetTheme).toHaveBeenCalledWith('dark');
  });
});
