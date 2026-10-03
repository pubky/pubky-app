import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ONBOARDING_ROUTES } from '@/app/routes';
import { InstallCard, InstallFooter, InstallHeader, InstallNavigation } from './Install';

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

// Mock dependencies
const mockReset = vi.fn();
vi.mock('@/stores/onboarding/onboarding.store', () => ({
  useOnboardingStore: () => ({
    reset: mockReset,
  }),
}));

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

    expect(mockPush).toHaveBeenCalledWith(ONBOARDING_ROUTES.PUBKY);
  });

  it('handles continue button click', () => {
    render(<InstallNavigation />);

    const continueButton = screen.getByRole('button', { name: /Continue with Pubky Ring/i });
    fireEvent.click(continueButton);

    expect(mockPush).toHaveBeenCalledWith(ONBOARDING_ROUTES.SCAN);
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

describe('InstallFooter', () => {
  it('underlines the keychain links so they are not distinguished by colour alone', () => {
    render(<InstallFooter />);

    const ringLink = screen.getByRole('link', { name: 'Pubky Ring' });
    const coreLink = screen.getByRole('link', { name: 'Pubky Core' });

    expect(ringLink).toHaveAttribute('target', '_blank');
    expect(ringLink).toHaveClass('underline');
    expect(coreLink).toHaveAttribute('target', '_blank');
    expect(coreLink).toHaveClass('underline');
  });
});

describe('InstallFooter - Snapshots', () => {
  it('matches snapshot for default InstallFooter', () => {
    const { container } = render(<InstallFooter />);
    expect(container.firstChild).toMatchSnapshot();
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
