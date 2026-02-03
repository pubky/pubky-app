import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Language } from './Language';

// Mock Next.js router
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    refresh: vi.fn(),
  }),
}));

// Mock @/core
vi.mock('@/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/core')>();
  return {
    ...actual,
    useSettingsStore: () => ({
      setLanguage: vi.fn(),
    }),
  };
});

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
