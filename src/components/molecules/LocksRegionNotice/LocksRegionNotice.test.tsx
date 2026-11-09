import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { LocksRegionNotice } from './LocksRegionNotice';

describe('LocksRegionNotice', () => {
  it('says paid unlocks are not available in the region, as a status and not an alert', () => {
    render(<LocksRegionNotice />);

    expect(screen.getByRole('status')).toHaveTextContent("Paid unlocks aren't available in your region yet.");
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('keeps the why behind an info icon that opens on click', () => {
    render(<LocksRegionNotice />);
    expect(screen.queryByTestId('locks-region-info')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'About this limit' }));

    expect(screen.getByTestId('locks-region-info')).toHaveTextContent(
      'Free posts, content you already unlocked and everything else in Pubky work as usual.',
    );
  });

  it('says it cannot tell where the viewer is, rather than blaming a region, for an unreadable one', () => {
    render(<LocksRegionNotice cause="unknown" />);

    expect(screen.getByRole('status')).toHaveTextContent("We can't tell where you are, so paid unlocks are paused.");
    fireEvent.click(screen.getByRole('button', { name: 'About this limit' }));
    expect(screen.getByTestId('locks-region-info')).toHaveTextContent("we couldn't read your location");
    expect(screen.queryByText(/VPN/i)).not.toBeInTheDocument();
  });

  it('offers no retry and no Bitkit', () => {
    render(<LocksRegionNotice />);

    expect(screen.queryByText(/try again/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/bitkit/i)).not.toBeInTheDocument();
  });

  describe('icon variant, for the composer toolbar', () => {
    it('shows only the info icon, and puts the line and the why into what it opens', () => {
      render(<LocksRegionNotice variant="icon" />);

      expect(screen.queryByText("Paid unlocks aren't available in your region yet.")).not.toBeInTheDocument();
      const icon = screen.getByRole('button', { name: "Paid unlocks aren't available in your region yet." });

      fireEvent.click(icon);

      expect(screen.getByText("Paid unlocks aren't available in your region yet.")).toBeInTheDocument();
      expect(screen.getByTestId('locks-region-info')).toHaveTextContent(
        'Free posts, content you already unlocked and everything else in Pubky work as usual.',
      );
    });

    it('names the unreadable location in its label', () => {
      render(<LocksRegionNotice variant="icon" cause="unknown" />);

      expect(
        screen.getByRole('button', { name: "We can't tell where you are, so paid unlocks are paused." }),
      ).toBeInTheDocument();
    });
  });

  // In a feed the notice sits inside the post card, which navigates to the post on any click.
  it('does not let a click reach the surrounding post card', () => {
    const onCardClick = vi.fn();
    render(
      <div onClick={onCardClick} role="presentation">
        <LocksRegionNotice />
      </div>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'About this limit' }));
    fireEvent.click(screen.getByTestId('locks-region-notice'));

    expect(onCardClick).not.toHaveBeenCalled();
  });
});
