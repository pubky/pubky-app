import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { DiscoveredTagSuggestion } from '@/application/pubchi/pubchi.types';
import { PubchiAppliedTagSuggestions } from './PubchiAppliedTagSuggestions';

const base: DiscoveredTagSuggestion = {
  applicationId: 'a'.repeat(64),
  owner: 'owner',
  target: { kind: 'post', uri: 'pubky://author/pub/pubky.app/posts/post-1' },
  label: 'builder',
  status: 'applied',
  alreadyExisted: false,
};

describe('PubchiAppliedTagSuggestions', () => {
  it.each([
    ['applied', false, 'Revert'],
    ['superseded', true, 'Already applied'],
    ['applying', null, 'Check again'],
    ['reconciliation-pending', null, 'Check again'],
    ['reverted-outside', false, 'Removed outside Pubchi'],
  ] as const)('renders %s with the expected action', (status, alreadyExisted, expected) => {
    render(
      <PubchiAppliedTagSuggestions
        suggestions={[{ ...base, status, alreadyExisted }]}
        onRevert={vi.fn()}
        onReconcile={vi.fn()}
      />,
    );

    expect(screen.getByText(expected)).toBeInTheDocument();
  });

  it('never offers Revert without explicit authorship', () => {
    render(
      <PubchiAppliedTagSuggestions
        suggestions={[{ ...base, alreadyExisted: null }]}
        onRevert={vi.fn()}
        onReconcile={vi.fn()}
      />,
    );

    expect(screen.queryByRole('button', { name: 'Revert' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Check again' })).toBeInTheDocument();
  });

  it('passes only the application id to actions', () => {
    const onRevert = vi.fn();
    const onReconcile = vi.fn();
    render(<PubchiAppliedTagSuggestions suggestions={[base]} onRevert={onRevert} onReconcile={onReconcile} />);

    fireEvent.click(screen.getByRole('button', { name: 'Revert' }));
    expect(onRevert).toHaveBeenCalledWith(base.applicationId);
    expect(onReconcile).not.toHaveBeenCalled();
  });

  it('omits reverted and failed receipts', () => {
    render(
      <PubchiAppliedTagSuggestions
        suggestions={[
          { ...base, status: 'reverted' },
          { ...base, applicationId: 'b'.repeat(64), status: 'failed' },
        ]}
        onRevert={vi.fn()}
        onReconcile={vi.fn()}
      />,
    );

    expect(screen.queryByTestId('pubchi-applied-section')).not.toBeInTheDocument();
  });
});
