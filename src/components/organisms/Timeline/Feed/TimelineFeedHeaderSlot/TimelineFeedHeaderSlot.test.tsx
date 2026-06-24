import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { TimelineFeedHeaderSlot } from './TimelineFeedHeaderSlot';

describe('TimelineFeedHeaderSlot', () => {
  it('renders children inside a spaced container slot', () => {
    render(
      <TimelineFeedHeaderSlot>
        <div data-testid="feed-header">Header</div>
      </TimelineFeedHeaderSlot>,
    );

    const slot = screen.getByTestId('feed-header').closest('[data-testid="container"]');
    expect(slot).toBeInTheDocument();
    expect(slot).toHaveClass('mb-6');
    expect(screen.getByTestId('feed-header')).toBeInTheDocument();
  });
});

describe('TimelineFeedHeaderSlot - Snapshots', () => {
  it('matches the snapshot with header children', () => {
    const { container } = render(
      <TimelineFeedHeaderSlot>
        <div>Bookmarks hero</div>
      </TimelineFeedHeaderSlot>,
    );

    expect(container.firstChild).toMatchSnapshot();
  });
});
