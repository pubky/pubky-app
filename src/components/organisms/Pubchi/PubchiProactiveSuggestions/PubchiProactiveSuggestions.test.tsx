import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { PubchiSuggestionV1 } from '@/libs/pubchi/schemas/suggestion';
import { PubchiProactiveSuggestions } from './PubchiProactiveSuggestions';

const owner = 'o1gg96ewuojmopcjbz8895478wdtxtzzuxnfjjz8o8e77csa1ngo';

const suggestion: PubchiSuggestionV1 = {
  schema: 'pubchi-suggestion',
  version: 1,
  bot: owner,
  owner,
  updated_at: 1_780_000_000,
  suggestion_id: 'what-i-missed-20260921',
  kind: 'what-i-missed',
  title: 'Three threads worth revisiting',
  summary: 'A short summary derived only from the cited public objects.',
  source_uris: [`pubky://${owner}/pub/pubky.app/profile.json`],
  run_id: 'run-01',
  expires_at: 1_780_604_800,
};

describe('PubchiProactiveSuggestions', () => {
  it('renders the production surface and persists dismiss through the callback', () => {
    const onDismiss = vi.fn();
    render(<PubchiProactiveSuggestions suggestions={[suggestion]} currentUserPubky={owner} onDismiss={onDismiss} />);

    expect(screen.getByTestId('pubchi-proactive-suggestions')).toHaveAttribute(
      'data-surface',
      'pubchi-proactive-suggestions',
    );
    expect(screen.getByText('Three threads worth revisiting')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(onDismiss).toHaveBeenCalledWith('what-i-missed-20260921');
  });

  it('omits the surface when there is nothing to show', () => {
    render(<PubchiProactiveSuggestions suggestions={[]} onDismiss={vi.fn()} />);
    expect(screen.queryByTestId('pubchi-proactive-suggestions')).not.toBeInTheDocument();
  });
});
