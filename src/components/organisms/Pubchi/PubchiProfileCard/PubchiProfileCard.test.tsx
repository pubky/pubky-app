import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@/atoms/Tooltip/Tooltip';
import { PUBCHI_PROFILE_CARD_SURFACE, PubchiProfileCard } from './PubchiProfileCard';

const bot = '9o6xw6h5r4n3m2k1j0hgfedcba987654321zyxwvutsrqpox444y';

vi.mock('@/molecules/FacehashAvatar/FacehashAvatar', () => ({
  FacehashAvatar: ({ initial }: { initial: string }) => <span data-testid="facehash-avatar">{initial}</span>,
}));

vi.mock('@/hooks/useCopyToClipboard/useCopyToClipboard', () => ({
  useCopyToClipboard: () => ({ copyToClipboard: vi.fn() }),
}));

function renderCard(overrides: Partial<React.ComponentProps<typeof PubchiProfileCard>> = {}) {
  return render(
    <TooltipProvider>
      <PubchiProfileCard
        bot={bot}
        displayName="Research Pubchi"
        createdAt={Date.UTC(2026, 0, 15) / 1000}
        verified
        backupConfirmed
        {...overrides}
      />
    </TooltipProvider>,
  );
}

describe('PubchiProfileCard', () => {
  afterEach(cleanup);

  it('renders the verified profile and public state caption', () => {
    renderCard();

    expect(screen.getByTestId(PUBCHI_PROFILE_CARD_SURFACE)).toHaveAttribute(
      'data-surface',
      PUBCHI_PROFILE_CARD_SURFACE,
    );
    expect(screen.getByText('Research Pubchi')).toBeInTheDocument();
    expect(screen.getByText('Operated by you — verified')).toBeInTheDocument();
    expect(screen.getByText('Public bot state — anyone can read this.')).toBeInTheDocument();
    expect(screen.getByText('Read-only')).toBeInTheDocument();
    expect(screen.getByText('Kimi K3 (Synonym-hosted)')).toBeInTheDocument();
    expect(screen.getByText('Created 01/15/2026')).toBeInTheDocument();
  });

  it('renders unverified ownership with warning tone', () => {
    renderCard({ verified: false, backupConfirmed: false });

    expect(screen.getByText('Ownership unverified').parentElement).toHaveClass('text-destructive');
    expect(screen.queryByText('Operated by you — verified')).not.toBeInTheDocument();
  });

  it('shows the truncated key and full key in the accessible copy control', () => {
    renderCard();

    const copyButton = screen.getByRole('button', { name: `Copy bot public key ${bot}` });
    expect(copyButton).toHaveTextContent('9o6x...444y');
    expect(copyButton).toHaveAttribute('title', bot);
  });

  it('renders backup and remove actions according to props and state', async () => {
    const onBackup = vi.fn();
    const onRemove = vi.fn();
    const user = userEvent.setup();

    renderCard({ backupConfirmed: false, onBackup, onRemove });
    await user.click(screen.getByRole('button', { name: /back up key/i }));
    await user.click(screen.getByRole('button', { name: /remove pubchi/i }));

    expect(onBackup).toHaveBeenCalledOnce();
    expect(onRemove).toHaveBeenCalledOnce();
  });

  it('shows backed up status and hides unavailable actions', () => {
    renderCard({ backupConfirmed: true });

    expect(screen.getByText('Backed up')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /back up key/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /remove pubchi/i })).not.toBeInTheDocument();
  });
});
