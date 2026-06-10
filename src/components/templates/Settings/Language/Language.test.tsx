import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Language } from './Language';

// Mock Next.js router
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    refresh: vi.fn(),
  }),
}));

// Mock next-intl
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => {
    const translations: Record<string, string> = {
      title: 'Language',
      description: 'Choose your preferred language',
      displayLanguage: 'Display language',
      selectLanguage: 'Select language',
    };
    return translations[key] ?? key;
  },
  useLocale: () => 'en',
}));

// Mock settings store
const mockSetLanguage = vi.fn();
vi.mock('@/stores/settings/settings.store', () => ({
  useSettingsStore: Object.assign(() => ({}), {
    getState: () => ({
      setLanguage: mockSetLanguage,
    }),
  }),
}));

// Mock hooks
vi.mock('@/hooks/useSettingsActions/useSettingsActions', () => ({
  useSettingsActions: () => ({
    setLanguage: vi.fn(),
  }),
}));

describe('Language', () => {
  it('renders language content', () => {
    render(<Language />);
    expect(screen.getByText('Language')).toBeInTheDocument();
  });

  it('renders language selector', () => {
    render(<Language />);
    expect(screen.getByText('Display language')).toBeInTheDocument();
    expect(screen.getByText('US English')).toBeInTheDocument();
  });
});

describe('Language - Snapshots', () => {
  it('matches snapshot', () => {
    const { container } = render(<Language />);
    expect(container.firstChild).toMatchSnapshot();
  });
});
