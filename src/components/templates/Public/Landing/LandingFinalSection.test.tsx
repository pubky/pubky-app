import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { LEGAL_ROUTES } from '@/app/routes';
import { LandingFinalSection } from './LandingFinalSection';

const mockPush = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
  }),
  usePathname: () => '/',
}));

vi.mock('@/hooks/useJoinRoute/useJoinRoute', () => ({
  useJoinRoute: () => '/onboarding/human',
}));

const LEGAL_PAGES = [
  { name: 'Terms of Service', href: LEGAL_ROUTES.TERMS_OF_USE },
  { name: 'Privacy Policy', href: LEGAL_ROUTES.PRIVACY_POLICY },
];

const AGE_DIALOG = { trigger: 'over 18 years old.', title: 'Age minimum: 18' };

describe('LandingFinalSection', () => {
  it('routes Join now to the join route', async () => {
    const user = userEvent.setup();
    render(<LandingFinalSection />);

    await user.click(screen.getByRole('button', { name: 'Join now' }));

    expect(mockPush).toHaveBeenCalledWith('/onboarding/human');
  });

  it('opens the Pubky Protocol link in a new tab with a non-colour cue', () => {
    render(<LandingFinalSection />);

    const link = screen.getByRole('link', { name: 'Pubky Protocol' });
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    expect(link).toHaveClass('font-semibold');
  });

  it.each(LEGAL_PAGES)('links "$name" to its page in the same tab', ({ name, href }) => {
    render(<LandingFinalSection />);

    const link = screen.getByRole('link', { name });
    expect(link).toHaveAttribute('href', href);
    expect(link).not.toHaveAttribute('target');
  });

  it('opens the age dialog when its trigger is clicked', async () => {
    const user = userEvent.setup();
    render(<LandingFinalSection />);

    const button = screen.getByRole('button', { name: AGE_DIALOG.trigger });
    expect(button).toHaveAttribute('aria-expanded', 'false');
    await user.click(button);

    expect(screen.getByRole('dialog', { name: AGE_DIALOG.title })).toBeInTheDocument();
  });

  it('opens the age dialog from the keyboard with Enter', async () => {
    const user = userEvent.setup();
    render(<LandingFinalSection />);

    screen.getByRole('button', { name: AGE_DIALOG.trigger }).focus();
    await user.keyboard('{Enter}');

    expect(screen.getByRole('dialog', { name: AGE_DIALOG.title })).toBeInTheDocument();
  });

  it('opens the age dialog from the keyboard with Space', async () => {
    const user = userEvent.setup();
    render(<LandingFinalSection />);

    screen.getByRole('button', { name: AGE_DIALOG.trigger }).focus();
    await user.keyboard(' ');

    expect(screen.getByRole('dialog', { name: AGE_DIALOG.title })).toBeInTheDocument();
  });

  it('reaches every legal link and trigger with the Tab key', async () => {
    const user = userEvent.setup();
    render(<LandingFinalSection />);

    screen.getByRole('button', { name: 'Join now' }).focus();
    await user.tab();
    expect(screen.getByRole('link', { name: 'Terms of Service' })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('link', { name: 'Privacy Policy' })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('button', { name: 'over 18 years old.' })).toHaveFocus();
  });
});
