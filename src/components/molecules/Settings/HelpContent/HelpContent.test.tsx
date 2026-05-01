import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { HelpContent } from './HelpContent';

vi.mock('@/organisms/DialogFeedback/DialogFeedback', () => {
  return {
    DialogFeedback: ({ open }: { open: boolean; onOpenChange: (open: boolean) => void }) =>
      open ? <div data-testid="dialog-feedback" /> : null,
  };
});

vi.mock('@/organisms/DialogPrivacy/DialogPrivacy', () => {
  return {
    DialogPrivacy: ({ trigger }: { trigger: React.ReactNode }) => <div data-testid="dialog-privacy">{trigger}</div>,
  };
});

vi.mock('@/organisms/DialogTerms/DialogTerms', () => {
  return {
    DialogTerms: ({ trigger }: { trigger: React.ReactNode }) => <div data-testid="dialog-terms">{trigger}</div>,
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
});

describe('HelpContent - Snapshots', () => {
  it('matches snapshot', () => {
    const { container } = render(<HelpContent />);
    expect(container.firstChild).toMatchSnapshot();
  });
});
