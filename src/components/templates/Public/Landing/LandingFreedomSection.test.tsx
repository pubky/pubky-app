import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LandingFreedomSection } from './LandingFreedomSection';

describe('LandingFreedomSection', () => {
  let setSectionVisible: (visible: boolean) => void;
  let initiallyVisible: boolean;

  beforeEach(() => {
    initiallyVisible = true;
    vi.stubGlobal(
      'IntersectionObserver',
      class extends IntersectionObserver {
        constructor(private readonly onIntersection: IntersectionObserverCallback) {
          super(onIntersection);
        }

        observe(target: Element) {
          setSectionVisible = (visible) => {
            const bounds = target.getBoundingClientRect();
            this.onIntersection(
              [
                {
                  target,
                  isIntersecting: visible,
                  intersectionRatio: visible ? 1 : 0,
                  boundingClientRect: bounds,
                  intersectionRect: bounds,
                  rootBounds: null,
                  time: 0,
                },
              ],
              this,
            );
          };
          setSectionVisible(initiallyVisible);
        }
      },
    );
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('offers only the selected artwork to the browser when the section comes into view', () => {
    initiallyVisible = false;
    vi.useFakeTimers();
    render(<LandingFreedomSection />);
    const card = screen.getByRole('article');
    act(() => vi.advanceTimersByTime(12_000));
    expect(card.querySelector('img')).toBeNull();

    act(() => setSectionVisible(true));
    const first = card.querySelector('img')!;
    expect(first.getAttribute('srcset')).toContain('landing-experience1.png');
    expect(card.querySelectorAll('img')).toHaveLength(1);

    fireEvent.click(screen.getByRole('button', { name: 'Go to slide 7: Make a living' }));
    expect(card.querySelectorAll('img')).toHaveLength(1);
    expect(card.querySelector('img')?.getAttribute('srcset')).toContain('landing-experience7.webp');

    act(() => setSectionVisible(false));
    act(() => vi.advanceTimersByTime(12_000));
    expect(screen.getByRole('button', { current: true })).toHaveAccessibleName('Go to slide 7: Make a living');
  });

  it('keeps the outgoing artwork visible until the selected image is ready', async () => {
    render(<LandingFreedomSection />);
    const card = screen.getByRole('article');
    const first = card.querySelector('img')!;
    fireEvent.load(first);
    await waitFor(() => expect(first).toHaveClass('opacity-100'));

    fireEvent.click(screen.getByRole('button', { name: 'Next slide' }));
    const second = card.querySelectorAll('img')[1];
    expect(first).toHaveClass('opacity-100');
    expect(second).toHaveClass('opacity-0');
    fireEvent.load(second);
    await waitFor(() => expect(second).toHaveClass('opacity-100'));
    expect(first).toHaveClass('opacity-0');

    fireEvent.click(screen.getByRole('button', { name: 'Go to slide 1: Create without limits' }));
    expect(first).toHaveClass('opacity-100');
    expect(second).toHaveClass('opacity-0');
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

  it('gives a slow slide its full duration once the artwork is ready', async () => {
    vi.useFakeTimers();
    render(<LandingFreedomSection />);
    fireEvent.click(screen.getByRole('button', { name: 'Go to slide 6: Sell your content' }));

    const image = screen.getByRole('article').querySelector('img')!;
    act(() => vi.advanceTimersByTime(12_000));
    expect(image).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Sell your content' })).toBeInTheDocument();
    await act(async () => { fireEvent.load(image); });
    act(() => vi.advanceTimersByTime(5999));
    expect(screen.getByRole('heading', { name: 'Sell your content' })).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(1));
    expect(screen.getByRole('heading', { name: 'Make a living' })).toBeInTheDocument();
    expect(screen.getByRole('button', { current: true })).toHaveAccessibleName('Go to slide 7: Make a living');
  });

  it('clears unrelated artwork on error, continues advancing, and retries when selected again', async () => {
    vi.useFakeTimers();
    render(<LandingFreedomSection />);
    const card = screen.getByRole('article');
    const first = card.querySelector('img')!;
    await act(async () => { fireEvent.load(first); });
    fireEvent.click(screen.getByRole('button', { name: 'Next slide' }));
    fireEvent.error(card.querySelectorAll('img')[1]);
    expect(first).toHaveClass('opacity-0');
    expect(card.querySelector('img.opacity-100')).toBeNull();
    expect(screen.getByRole('heading', { name: 'Browse your way' })).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(6000));
    expect(screen.getByRole('heading', { name: 'Shape perspectives' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Go to slide 2: Browse your way' }));
    const retry = card.querySelectorAll('img')[1];
    await act(async () => { fireEvent.load(retry); });
    expect(retry).toHaveClass('opacity-100');
  });

  it('restarts the full slide duration when a dot is selected again', async () => {
    vi.useFakeTimers();
    render(<LandingFreedomSection />);

    fireEvent.click(screen.getByRole('button', { name: 'Go to slide 7: Make a living' }));
    await act(async () => { fireEvent.load(screen.getByRole('article').querySelector('img')!); });
    act(() => vi.advanceTimersByTime(5000));
    fireEvent.click(screen.getByRole('button', { name: 'Go to slide 7: Make a living' }));
    act(() => vi.advanceTimersByTime(5999));
    expect(screen.getByRole('heading', { name: 'Make a living' })).toBeInTheDocument();

    act(() => vi.advanceTimersByTime(1));
    expect(screen.getByRole('heading', { name: 'Create without limits' })).toBeInTheDocument();
  });
});
