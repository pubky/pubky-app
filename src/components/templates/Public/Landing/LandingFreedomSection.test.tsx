import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LandingFreedomSection } from './LandingFreedomSection';

describe('LandingFreedomSection', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'IntersectionObserver',
      class extends IntersectionObserver {
        constructor(private readonly onIntersection: IntersectionObserverCallback) {
          super(onIntersection);
        }

        observe(target: Element) {
          this.onIntersection(
            [
              {
                target,
                isIntersecting: true,
                intersectionRatio: 1,
                boundingClientRect: target.getBoundingClientRect(),
                intersectionRect: target.getBoundingClientRect(),
                rootBounds: null,
                time: 0,
              },
            ],
            this,
          );
        }
      },
    );
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('provides seven slide controls with the first slide current', () => {
    render(<LandingFreedomSection />);

    const navigation = screen.getByRole('group', { name: 'Slide navigation' });
    expect(within(navigation).getAllByRole('button')).toHaveLength(7);
    expect(within(navigation).getByRole('button', { current: true })).toHaveAccessibleName(
      'Go to slide 1: Create without limits',
    );
  });

  it('selects the Market slide and returns to the first slide with the arrow', async () => {
    const user = userEvent.setup();
    render(<LandingFreedomSection />);

    await user.click(screen.getByRole('button', { name: 'Go to slide 7: Make a living' }));

    expect(screen.getByRole('heading', { name: 'Make a living' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Create without limits' })).not.toBeInTheDocument();
    expect(
      screen.getByText(
        'Sell products on Pubky Market. Turn your key into a shop and connect directly with buyers.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { current: true })).toHaveAccessibleName('Go to slide 7: Make a living');

    await user.click(screen.getByRole('button', { name: 'Next slide' }));

    expect(screen.getByRole('heading', { name: 'Create without limits' })).toBeInTheDocument();
    expect(screen.getByRole('button', { current: true })).toHaveAccessibleName('Go to slide 1: Create without limits');
  });

  it('supports keyboard selection', async () => {
    const user = userEvent.setup();
    render(<LandingFreedomSection />);

    screen.getByRole('button', { name: 'Go to slide 6: Sell your content' }).focus();
    await user.keyboard('{Enter}');
    expect(screen.getByRole('heading', { name: 'Sell your content' })).toBeInTheDocument();
    expect(screen.getByRole('button', { current: true })).toHaveAccessibleName('Go to slide 6: Sell your content');
  });

  it('advances from Locks to Market automatically', () => {
    vi.useFakeTimers();
    render(<LandingFreedomSection />);
    fireEvent.click(screen.getByRole('button', { name: 'Go to slide 6: Sell your content' }));

    act(() => vi.advanceTimersByTime(6000));
    expect(screen.getByRole('heading', { name: 'Make a living' })).toBeInTheDocument();
    expect(screen.getByRole('button', { current: true })).toHaveAccessibleName('Go to slide 7: Make a living');
  });

  it('restarts the full slide duration when a dot is selected again', () => {
    vi.useFakeTimers();
    render(<LandingFreedomSection />);

    fireEvent.click(screen.getByRole('button', { name: 'Go to slide 7: Make a living' }));
    act(() => vi.advanceTimersByTime(5000));
    fireEvent.click(screen.getByRole('button', { name: 'Go to slide 7: Make a living' }));
    act(() => vi.advanceTimersByTime(5999));
    expect(screen.getByRole('heading', { name: 'Make a living' })).toBeInTheDocument();

    act(() => vi.advanceTimersByTime(1));
    expect(screen.getByRole('heading', { name: 'Create without limits' })).toBeInTheDocument();
  });
});
