import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { LanguageSelector } from './LanguageSelector';

// Mock Next.js router
const mockRefresh = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    refresh: mockRefresh,
  }),
}));

// Mock @/core
const mockSetLanguage = vi.fn();
vi.mock('@/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/core')>();
  return {
    ...actual,
    useSettingsStore: Object.assign(() => ({}), {
      getState: () => ({
        setLanguage: mockSetLanguage,
      }),
    }),
  };
});

// Mock hooks
const mockHookSetLanguage = vi.fn();
vi.mock('@/hooks/useSettingsActions/useSettingsActions', () => ({
  useSettingsActions: () => ({
    setLanguage: mockHookSetLanguage,
  }),
}));

// Store original location
const originalLocation = window.location;

describe('LanguageSelector', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Clear cookies
    document.cookie = 'locale=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;';
    // Mock window.location
    Object.defineProperty(window, 'location', {
      value: {
        ...originalLocation,
        href: 'http://localhost:3000/settings/language',
        protocol: 'https:',
      },
      writable: true,
    });
  });

  afterEach(() => {
    // Restore original location
    Object.defineProperty(window, 'location', {
      value: originalLocation,
      writable: true,
    });
  });

  it('renders correctly', () => {
    render(<LanguageSelector />);
    expect(screen.getByText('Display language')).toBeInTheDocument();
    expect(screen.getByText('US English')).toBeInTheDocument();
  });

  it('opens dropdown when clicking trigger', () => {
    render(<LanguageSelector />);
    const trigger = screen.getByRole('button');
    fireEvent.click(trigger);

    // Dropdown is open - should show language options (native names)
    expect(screen.getByText('Español')).toBeInTheDocument();
    expect(screen.getByText('Deutsch')).toBeInTheDocument();
    expect(screen.getByText('Français')).toBeInTheDocument();
  });

  it('does not navigate when selecting the current language', () => {
    render(<LanguageSelector />);
    const trigger = screen.getByRole('button');
    fireEvent.click(trigger);

    // US English is the current language (from useLocale mock which returns 'en')
    const englishOptions = screen.getAllByText('US English');
    fireEvent.click(englishOptions[1]); // Click the one in dropdown

    // Should not call refresh since we're selecting the same language
    expect(mockRefresh).not.toHaveBeenCalled();
  });

  it('sets cookie and refreshes when selecting a different language', () => {
    render(<LanguageSelector />);
    const trigger = screen.getByRole('button');
    fireEvent.click(trigger);

    // Español (Spanish) is a different language
    const spanishOption = screen.getByText('Español');
    fireEvent.click(spanishOption);

    // Cookie is set inside SettingsController.setLanguage (not tested here)
    expect(mockHookSetLanguage).toHaveBeenCalledWith('es');
    expect(mockRefresh).toHaveBeenCalled();
  });
});

describe('LanguageSelector - Snapshots', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('matches snapshot - closed', () => {
    const { container } = render(<LanguageSelector />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot - open', () => {
    const { container } = render(<LanguageSelector />);
    const trigger = screen.getByRole('button');
    fireEvent.click(trigger);
    expect(container.firstChild).toMatchSnapshot();
  });
});
