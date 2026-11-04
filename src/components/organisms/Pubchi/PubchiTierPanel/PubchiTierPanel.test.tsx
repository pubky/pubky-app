import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PUBCHI_TIER_PANEL_SURFACE, type PubchiTier, PubchiTierPanel } from './PubchiTierPanel';

const defaultProps = {
  desiredTier: 'assisted' as const,
  effectiveTier: 'assisted' as const,
  availableTiers: ['read-only', 'assisted'] as PubchiTier[],
  autonomousDisabledReason: 'Autonomous publishing arrives after homeserver session revocation ships.',
  onChangeDesired: vi.fn(),
};

describe('PubchiTierPanel', () => {
  it('renders the disabled autonomous tier and its reason', () => {
    render(<PubchiTierPanel {...defaultProps} />);

    expect(screen.getByTestId(PUBCHI_TIER_PANEL_SURFACE)).toHaveAttribute('data-surface', PUBCHI_TIER_PANEL_SURFACE);
    expect(screen.getByLabelText('Pubchi permission tier')).toBeInTheDocument();
    expect(screen.getByLabelText('Autonomous')).toBeDisabled();
    expect(screen.getByText(defaultProps.autonomousDisabledReason)).toBeInTheDocument();
  });

  it('describes the current assisted capabilities truthfully', () => {
    render(<PubchiTierPanel {...defaultProps} />);

    expect(screen.getByText('Answers and proposes; you approve.')).toBeInTheDocument();
    expect(screen.getByText('Answers questions about your graph and proposes feeds you approve.')).toBeInTheDocument();
    expect(screen.getByText('Act unattended; nothing is published without you.')).toBeInTheDocument();
    expect(screen.queryByText('Drafts posts, tags, and feed changes you approve.')).not.toBeInTheDocument();
  });

  it('shows the effective-tier alert when the effective tier is lower', () => {
    render(
      <PubchiTierPanel
        {...defaultProps}
        effectiveTier="read-only"
        effectiveReason="Session lacks /pub/app.pubchi/v1/:rw"
      />,
    );

    expect(screen.getByRole('alert')).toHaveTextContent('Session lacks /pub/app.pubchi/v1/:rw');
    expect(screen.getByText('Desired: Assisted · Effective: Read-only')).toBeInTheDocument();
  });

  it('shows exact technical capabilities and downgrade copy', () => {
    const onChangeDesired = vi.fn();
    render(<PubchiTierPanel {...defaultProps} onChangeDesired={onChangeDesired} />);

    fireEvent.click(screen.getByText('Technical details'));
    expect(screen.getAllByText('/pub/app.pubchi/v1/:rw', { exact: true })).toHaveLength(3);
    expect(screen.getByText('/pub/pubky.app/posts/:w', { exact: false })).toBeInTheDocument();
    expect(screen.getByText('/pub/pubky.app/tags/:w', { exact: false })).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('Read-only'));
    expect(onChangeDesired).toHaveBeenCalledWith('read-only');
    expect(screen.getByRole('status')).toHaveTextContent('Switching down revokes access first, then saves.');
  });
});
