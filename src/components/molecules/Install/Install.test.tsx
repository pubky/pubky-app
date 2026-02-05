import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { InstallCard, InstallHeader, InstallNavigation } from './Install';
import * as App from '@/app';

// Mock Next.js Image
vi.mock('next/image', () => ({
  __esModule: true,
  default: ({ src, alt, ...props }: { src: string; alt: string; [key: string]: unknown }) => (
    <img src={src} alt={alt} {...props} />
  ),
}));

// Mock Next.js router
const mockPush = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
  }),
}));

// Mock Core
const mockReset = vi.fn();
vi.mock('@/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/core')>();
  return {
    ...actual,
    useOnboardingStore: () => ({
      reset: mockReset,
    }),
  };
});

describe('InstallCard - Snapshots', () => {
  it('matches snapshot', () => {
    const { container } = render(<InstallCard />);
    expect(container.firstChild).toMatchSnapshot();
  });
});

describe('InstallHeader - Snapshots', () => {
  it('matches snapshot', () => {
    const { container } = render(<InstallHeader />);
    expect(container.firstChild).toMatchSnapshot();
  });
});

describe('InstallNavigation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('handles create button click', () => {
    render(<InstallNavigation />);

    const createButton = screen.getByRole('button', { name: /Create keys in browser/i });
    fireEvent.click(createButton);

    expect(mockPush).toHaveBeenCalledWith(App.ONBOARDING_ROUTES.PUBKY);
  });

  it('handles continue button click', () => {
    render(<InstallNavigation />);

    const continueButton = screen.getByRole('button', { name: /Continue with Pubky Ring/i });
    fireEvent.click(continueButton);

    expect(mockPush).toHaveBeenCalledWith(App.ONBOARDING_ROUTES.SCAN);
  });

  it('shows loading state and disables both buttons when create button is clicked', () => {
    render(<InstallNavigation />);

    const createButton = screen.getByRole('button', { name: /Create keys in browser/i });
    const continueButton = screen.getByRole('button', { name: /Continue with Pubky Ring/i });

    expect(createButton).not.toBeDisabled();
    expect(continueButton).not.toBeDisabled();

    fireEvent.click(createButton);

    expect(createButton).toBeDisabled();
    expect(continueButton).toBeDisabled();
  });

  it('shows loading state and disables both buttons when continue button is clicked', () => {
    render(<InstallNavigation />);

    const createButton = screen.getByRole('button', { name: /Create keys in browser/i });
    const continueButton = screen.getByRole('button', { name: /Continue with Pubky Ring/i });

    expect(createButton).not.toBeDisabled();
    expect(continueButton).not.toBeDisabled();

    fireEvent.click(continueButton);

    expect(createButton).toBeDisabled();
    expect(continueButton).toBeDisabled();
  });
});

describe('InstallNavigation - Snapshots', () => {
  it('matches snapshot', () => {
    const { container } = render(<InstallNavigation />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot when create button is loading', () => {
    const { container } = render(<InstallNavigation />);

    const createButton = screen.getByRole('button', { name: /Create keys in browser/i });
    fireEvent.click(createButton);

    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot when continue button is loading', () => {
    const { container } = render(<InstallNavigation />);

    const continueButton = screen.getByRole('button', { name: /Continue with Pubky Ring/i });
    fireEvent.click(continueButton);

    expect(container.firstChild).toMatchSnapshot();
  });
});
