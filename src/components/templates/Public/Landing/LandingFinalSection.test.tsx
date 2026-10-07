import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
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

const LEGAL_DIALOGS = [
  { trigger: 'Terms of Service', title: 'Terms of Service' },
  { trigger: 'Privacy Policy', title: 'Privacy Policy' },
  { trigger: 'over 18 years old.', title: 'Age minimum: 18' },
];

describe('LandingFinalSection', () => {
  it('routes Join now to the join route', async () => {
    const user = userEvent.setup();
    render(<LandingFinalSection />);

    await user.click(screen.getByRole('button', { name: 'Join now' }));

    expect(mockPush).toHaveBeenCalledWith('/onboarding/human');
  });

  it('renders the Pubky Protocol link inside the legal line that underlines its links', () => {
    render(<LandingFinalSection />);

    const link = screen.getByRole('link', { name: 'Pubky Protocol' });
    expect(link.closest('p')).toHaveClass('[&_a]:underline');
  });

  it.each(LEGAL_DIALOGS)('opens the "$title" dialog when "$trigger" is clicked', async ({ trigger, title }) => {
    const user = userEvent.setup();
    render(<LandingFinalSection />);

    const button = screen.getByRole('button', { name: trigger });
    expect(button).toHaveAttribute('aria-expanded', 'false');
    await user.click(button);

    expect(screen.getByRole('dialog', { name: title })).toBeInTheDocument();
  });

  it.each(LEGAL_DIALOGS)('opens the "$title" dialog from the keyboard with Enter', async ({ trigger, title }) => {
    const user = userEvent.setup();
    render(<LandingFinalSection />);

    screen.getByRole('button', { name: trigger }).focus();
    await user.keyboard('{Enter}');

    expect(screen.getByRole('dialog', { name: title })).toBeInTheDocument();
  });

  it.each(LEGAL_DIALOGS)('opens the "$title" dialog from the keyboard with Space', async ({ trigger, title }) => {
    const user = userEvent.setup();
    render(<LandingFinalSection />);

    screen.getByRole('button', { name: trigger }).focus();
    await user.keyboard(' ');

    expect(screen.getByRole('dialog', { name: title })).toBeInTheDocument();
  });

  it('reaches every legal trigger with the Tab key', async () => {
    const user = userEvent.setup();
    render(<LandingFinalSection />);

    screen.getByRole('button', { name: 'Join now' }).focus();
    await user.tab();
    expect(screen.getByRole('button', { name: 'Terms of Service' })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('button', { name: 'Privacy Policy' })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('button', { name: 'over 18 years old.' })).toHaveFocus();
  });
});

describe('LandingFinalSection - Snapshots', () => {
  it('matches snapshot with default props', () => {
    const { container } = render(<LandingFinalSection />);
    expect(container.firstChild).toMatchSnapshot();
  });
});
