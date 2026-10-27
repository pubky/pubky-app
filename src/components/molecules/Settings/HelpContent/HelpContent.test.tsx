import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { LEGAL_ROUTES } from '@/app/routes';
import { HelpContent } from './HelpContent';

vi.mock('@/organisms/DialogFeedback/DialogFeedback', () => {
  return {
    DialogFeedback: ({ open }: { open: boolean; onOpenChange: (open: boolean) => void }) =>
      open ? <div data-testid="dialog-feedback" /> : null,
  };
});

vi.mock('@/organisms/FeedbackCard/FeedbackCard', () => {
  return {
    FeedbackCard: () => null,
  };
});

// Mock window.open
const mockWindowOpen = vi.fn();
Object.defineProperty(window, 'open', { value: mockWindowOpen });

describe('HelpContent', () => {
  it('renders without crashing', () => {
    const { container } = render(<HelpContent />);
    expect(container).toBeTruthy();
  });

  it('renders FAQ heading', () => {
    render(<HelpContent />);
    expect(screen.getByText('FAQ')).toBeInTheDocument();
  });

  it('renders FAQ section titles', () => {
    render(<HelpContent />);
    expect(screen.getByText('1. Getting Started & Onboarding')).toBeInTheDocument();
    expect(screen.getByText('2. Backups & Account Recovery')).toBeInTheDocument();
    expect(screen.getByText('3. Profile & Social Features')).toBeInTheDocument();
    expect(screen.getByText('4. How Pubky App Works')).toBeInTheDocument();
  });

  it('renders support section', () => {
    render(<HelpContent />);
    expect(screen.getByText('Support')).toBeInTheDocument();
  });

  it('renders user guide section', () => {
    render(<HelpContent />);
    expect(screen.getByText('User Guide')).toBeInTheDocument();
  });

  it('opens user guide link on button click', () => {
    render(<HelpContent />);
    const button = screen.getByText('User guide');
    fireEvent.click(button);
    expect(mockWindowOpen).toHaveBeenCalledWith(
      'https://support.synonym.to/hc/pubky-app-help-center/en',
      '_blank',
      'noopener,noreferrer',
    );
  });

  it('opens telegram link on support button click', () => {
    render(<HelpContent />);
    const button = screen.getByText('Support (Telegram)');
    fireEvent.click(button);
    expect(mockWindowOpen).toHaveBeenCalledWith('https://t.me/pubkychat', '_blank', 'noopener,noreferrer');
  });

  it('links Terms of service and Privacy policy to their pages in the same tab, styled as buttons', () => {
    render(<HelpContent />);

    const terms = screen.getByRole('link', { name: 'Terms of service' });
    expect(terms).toHaveAttribute('href', LEGAL_ROUTES.TERMS_OF_USE);
    expect(terms).toHaveAttribute('id', 'tos-btn');
    expect(terms).not.toHaveAttribute('target');
    const privacy = screen.getByRole('link', { name: 'Privacy policy' });
    expect(privacy).toHaveAttribute('href', LEGAL_ROUTES.PRIVACY_POLICY);
    expect(privacy).toHaveAttribute('id', 'privacy-btn');
    expect(privacy).toHaveAttribute('data-variant', 'secondary');
  });
});
