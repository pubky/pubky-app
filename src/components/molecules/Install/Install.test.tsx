import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ONBOARDING_ROUTES } from '@/app/routes';
import { InstallFooter, InstallNavigation } from './Install';

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
describe('InstallNavigation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('offers only Pubky Ring, with no in-browser key creation', () => {
    render(<InstallNavigation />);

    expect(screen.getAllByRole('button')).toHaveLength(1);
    expect(screen.queryByRole('button', { name: /Create keys in browser/i })).not.toBeInTheDocument();
  });

  it('handles continue button click', () => {
    render(<InstallNavigation />);

    const continueButton = screen.getByRole('button', { name: /Continue with Pubky Ring/i });
    fireEvent.click(continueButton);

    expect(mockPush).toHaveBeenCalledWith(ONBOARDING_ROUTES.SCAN);
  });

  it('shows loading state and disables the button when continue is clicked', () => {
    render(<InstallNavigation />);

    const continueButton = screen.getByRole('button', { name: /Continue with Pubky Ring/i });

    expect(continueButton).not.toBeDisabled();

    fireEvent.click(continueButton);

    expect(continueButton).toBeDisabled();
  });
});

describe('InstallFooter', () => {
  it('renders the keychain links inside the footer line that underlines its links', () => {
    render(<InstallFooter />);

    const ringLink = screen.getByRole('link', { name: 'Pubky Ring' });
    const pubkyLink = screen.getByRole('link', { name: 'Pubky' });

    expect(ringLink).toHaveAttribute('target', '_blank');
    expect(pubkyLink).toHaveAttribute('target', '_blank');
    expect(ringLink.closest('p')).toHaveClass('[&_a]:underline');
    expect(pubkyLink.closest('p')).toBe(ringLink.closest('p'));
  });

  it('does not offer creating keys in the browser', () => {
    render(<InstallFooter />);

    expect(screen.queryByText(/browser/i)).not.toBeInTheDocument();
  });
});
