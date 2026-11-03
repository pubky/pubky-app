import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PostPreviewNestingProvider } from '@/molecules/PostPreviewCard/PostPreviewNestingContext';
import { LockedPostCard, SLIDE_MS } from './LockedPostCard';

describe('LockedPostCard', () => {
  it('steps down a shade inside a post preview, where the surround is already bg-muted', () => {
    render(
      <PostPreviewNestingProvider>
        <LockedPostCard title="Secret" price={{ amount: '1234', asset: 'BTC' }} />
      </PostPreviewNestingProvider>,
    );

    const card = screen.getByTestId('locked-post-card');
    expect(card).toHaveClass('bg-card');
    expect(card).not.toHaveClass('bg-muted');
  });

  it('keeps bg-muted outside a post preview', () => {
    render(<LockedPostCard title="Secret" price={{ amount: '1234', asset: 'BTC' }} />);

    expect(screen.getByTestId('locked-post-card')).toHaveClass('bg-muted');
  });

  it('requests the shield illustration at 68px so it clears the Unlock pill on narrow cards', () => {
    const { container } = render(<LockedPostCard title="Secret" price={{ amount: '1234', asset: 'BTC' }} />);

    // Decorative (alt=""), so it has no accessible role to query by.
    const shield = container.querySelector('img[src*="shield.png"]');
    expect(shield).toHaveAttribute('width', '68');
    expect(shield).toHaveAttribute('height', '68');
  });

  it('anchors the shield to the bottom of the card, level with the Unlock pill', () => {
    render(<LockedPostCard title="Secret" price={{ amount: '1234', asset: 'BTC' }} />);

    const card = screen.getByTestId('locked-post-card');
    expect(card).toHaveClass('items-end');
    expect(card).not.toHaveClass('items-start');
  });

  it('caps the shield at 48px on a narrow card (the 336px and 309px Cards layout cards)', () => {
    const { container } = render(<LockedPostCard title="Secret" price={{ amount: '1234', asset: 'BTC' }} />);

    // The card is its own size container, so the cap follows the card, not the viewport.
    expect(screen.getByTestId('locked-post-card')).toHaveClass('@container/lock-card');
    const shieldBox = container.querySelector('img[src*="shield.png"]')?.parentElement;
    expect(shieldBox).toHaveClass('w-17', '@max-xs/lock-card:w-12');
  });

  it('hides the shield rather than drawing it under 48px when the pill leaves too little room', () => {
    const { container } = render(<LockedPostCard title="Secret" price={{ amount: '1234', asset: 'BTC' }} />);

    // The image shows only once its own box is at least 3rem (48px) wide, so a squeezed card drops it.
    const shield = container.querySelector('img[src*="shield.png"]');
    expect(shield).toHaveClass('hidden', '@min-[3rem]/shield:block');
    expect(shield).not.toHaveClass('@min-[2.5rem]/shield:block');
  });

  it('falls back to the default title while the creator has not typed one', () => {
    render(<LockedPostCard title="" />);
    expect(screen.getByRole('heading', { level: 4 })).toHaveTextContent('Locked content');
  });

  it('falls back to the default title for a whitespace-only title', () => {
    render(<LockedPostCard title="   " />);
    expect(screen.getByRole('heading', { level: 4 })).toHaveTextContent('Locked content');
  });

  it('shows the creator-typed title', () => {
    render(<LockedPostCard title="My most famous quote" />);
    expect(screen.getByRole('heading', { level: 4 })).toHaveTextContent('My most famous quote');
  });

  it('shows the USD price beside Unlock', () => {
    render(<LockedPostCard price={{ amount: '1234', asset: 'USD' }} />);
    expect(screen.getByText('$12.34')).toBeInTheDocument();
  });

  it('shows the grouped price beside Unlock', () => {
    render(<LockedPostCard title="" price={{ amount: '1000', asset: 'BTC' }} />);
    expect(screen.getByText('₿1,000')).toBeInTheDocument();
    expect(screen.queryByText('••••••')).not.toBeInTheDocument();
  });

  // No price to show (a failed lock file, a lock without a price, or a caller that does not pass
  // `isLoading`): the mask fills the slot so the pill is never half-empty.
  it('falls back to the mask while the price is unknown', () => {
    render(<LockedPostCard title="" />);
    expect(screen.getByText('••••••')).toBeInTheDocument();
  });

  // Composer preview: no `onUnlock`, so the lock (which does not exist until Post) cannot be opened.
  it('renders the Unlock control as inert without an onUnlock handler', () => {
    render(<LockedPostCard title="" />);
    const button = screen.getByRole('button', { name: 'Unlock' });

    expect(button).toBeDisabled();
    expect(button).toHaveClass('disabled:opacity-100');
    expect(button.parentElement).toHaveClass('cursor-not-allowed', 'opacity-50');
  });

  // Reader: an `onUnlock` handler enables the control; it runs after the slide-over transition.
  it('enables Unlock and calls onUnlock once the slide completes', () => {
    vi.useFakeTimers();
    try {
      const onUnlock = vi.fn();
      render(<LockedPostCard title="" onUnlock={onUnlock} />);

      const button = screen.getByRole('button', { name: 'Unlock' });
      expect(button).toBeEnabled();

      fireEvent.click(button);
      // Deferred until the button finishes sliding over the mask.
      expect(onUnlock).not.toHaveBeenCalled();

      vi.advanceTimersByTime(SLIDE_MS);
      expect(onUnlock).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not fire onUnlock after the card unmounts mid-slide', () => {
    vi.useFakeTimers();
    try {
      const onUnlock = vi.fn();
      const { unmount } = render(<LockedPostCard title="" onUnlock={onUnlock} />);
      fireEvent.click(screen.getByRole('button', { name: 'Unlock' }));
      unmount();
      vi.advanceTimersByTime(SLIDE_MS);
      expect(onUnlock).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('ignores a second click while the slide is pending (no double unlock)', () => {
    vi.useFakeTimers();
    try {
      const onUnlock = vi.fn();
      render(<LockedPostCard title="" onUnlock={onUnlock} />);
      const button = screen.getByRole('button', { name: 'Unlock' });
      fireEvent.click(button);
      fireEvent.click(button);
      vi.advanceTimersByTime(SLIDE_MS);
      expect(onUnlock).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  // The price is still loading, so a dimmed pill would read as "disabled" and then flash to active.
  it('covers the whole pill with one spinner while loading, keeping its contents for width', () => {
    render(<LockedPostCard title="" isLoading />);

    expect(screen.getByTestId('spinner')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Unlock' })).toHaveClass('invisible');
    expect(screen.getByText('••••••').parentElement).toHaveClass('invisible');
  });

  it('keeps Unlock inert but undimmed while loading, even with a handler', () => {
    const onUnlock = vi.fn();
    render(<LockedPostCard title="" isLoading onUnlock={onUnlock} />);
    const button = screen.getByRole('button', { name: 'Unlock' });

    expect(button).toBeDisabled();
    expect(button.parentElement).not.toHaveClass('opacity-50');
    fireEvent.click(button);
    expect(onUnlock).not.toHaveBeenCalled();
  });

  it('honours an explicit disabled even with a handler', () => {
    const onUnlock = vi.fn();
    render(<LockedPostCard title="" onUnlock={onUnlock} disabled />);
    expect(screen.getByRole('button', { name: 'Unlock' })).toBeDisabled();
  });

  it('renders an editable title input bound to editableTitle in composer mode', () => {
    const onChange = vi.fn();
    render(<LockedPostCard title="" editableTitle={{ value: 'My quote', onChange }} />);

    const input = screen.getByRole('textbox', { name: 'Lock title' });
    expect(input).toHaveValue('My quote');
    fireEvent.change(input, { target: { value: 'Updated' } });
    expect(onChange).toHaveBeenCalledWith('Updated');
  });

  it('keeps the post type icon while the title is being edited, with no checkmark', () => {
    render(<LockedPostCard title="" editableTitle={{ value: '', onChange: vi.fn() }} />);

    fireEvent.focus(screen.getByRole('textbox', { name: 'Lock title' }));

    expect(document.querySelector('.lucide-sticky-note')).toBeInTheDocument();
    expect(document.querySelector('.lucide-check')).not.toBeInTheDocument();
  });

  it('starts editing the title from the pencil button after it', () => {
    render(<LockedPostCard title="" editableTitle={{ value: 'My quote', onChange: vi.fn() }} />);

    fireEvent.click(screen.getByRole('button', { name: 'Edit lock title' }));

    expect(screen.getByRole('textbox', { name: 'Lock title' })).toHaveFocus();
  });

  it('disables the pencil button together with the title', () => {
    render(<LockedPostCard title="" editableTitle={{ value: 'My quote', onChange: vi.fn(), disabled: true }} />);

    expect(screen.getByRole('button', { name: 'Edit lock title' })).toBeDisabled();
  });

  it.each(['Enter', 'Escape'])('ends editing on %s and keeps the typed title', (key) => {
    const onChange = vi.fn();
    render(<LockedPostCard title="" editableTitle={{ value: 'My quote', onChange }} />);
    const input = screen.getByRole('textbox', { name: 'Lock title' });

    input.focus();
    fireEvent.keyDown(input, { key });

    expect(input).not.toHaveFocus();
    expect(input).toHaveValue('My quote');
    expect(onChange).not.toHaveBeenCalled();
  });

  it('keeps editing on an Enter that confirms an IME composition', () => {
    render(<LockedPostCard title="" editableTitle={{ value: '제목', onChange: vi.fn() }} />);
    const input = screen.getByRole('textbox', { name: 'Lock title' });

    input.focus();
    fireEvent.keyDown(input, { key: 'Enter', isComposing: true });

    expect(input).toHaveFocus();
  });

  it('makes the price a button that changes it when onChangePrice is set', () => {
    const onChangePrice = vi.fn();
    render(<LockedPostCard price={{ amount: '1000', asset: 'BTC' }} onChangePrice={onChangePrice} />);

    // Browsers differ on the space between the hidden prefix and the price in the accessible name.
    const priceButton = screen.getByRole('button', { name: /^Change price:\s?₿1,000$/ });
    fireEvent.click(priceButton);
    expect(onChangePrice).toHaveBeenCalledTimes(1);
  });

  it('dims only the inert Unlock, not the whole pill, when the price can be changed', () => {
    render(<LockedPostCard price={{ amount: '1000', asset: 'BTC' }} onChangePrice={vi.fn()} />);

    const unlock = screen.getByRole('button', { name: 'Unlock' });
    expect(unlock).toBeDisabled();
    expect(unlock).toHaveClass('disabled:opacity-50');
    expect(unlock.parentElement).not.toHaveClass('opacity-50');
  });

  it('shows the price as plain text without onChangePrice', () => {
    render(<LockedPostCard price={{ amount: '1000', asset: 'BTC' }} />);

    expect(screen.getByText('₿1,000')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Change price/ })).not.toBeInTheDocument();
  });

  it('shows a static, non-editable title in reader mode', () => {
    render(<LockedPostCard title="Secret" />);
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 4 })).toHaveTextContent('Secret');
  });

  it('applies two-line clamping and anywhere wrapping to a reader title', () => {
    render(<LockedPostCard title="A long lock title" />);
    expect(screen.getByRole('heading', { level: 4 })).toHaveClass('line-clamp-2', 'wrap-anywhere');
  });

  // #2433: one helper picks the icon and the untitled fallback from the saved kind.
  describe('content kind', () => {
    it.each([
      ['image', 'Locked image', 'lucide-image'],
      ['article', 'Locked article', 'lucide-newspaper'],
      ['video', 'Locked video', 'lucide-circle-play'],
      ['file', 'Locked file', 'lucide-download'],
      ['link', 'Locked content', 'lucide-link'],
      ['note', 'Locked content', 'lucide-sticky-note'],
      ['podcast', 'Locked content', 'lucide-sticky-note'],
      [undefined, 'Locked content', 'lucide-sticky-note'],
    ] as const)('shows %s as "%s" with its icon when untitled', (contentKind, title, iconClass) => {
      const { container } = render(<LockedPostCard title="" contentKind={contentKind} price={null} />);

      expect(screen.getByRole('heading', { level: 4 })).toHaveTextContent(title);
      expect(container.querySelector(`svg.${iconClass}`)).toBeInTheDocument();
    });

    it('keeps the creator title and only swaps the icon', () => {
      const { container } = render(<LockedPostCard title="Sunset" contentKind="image" price={null} />);

      expect(screen.getByRole('heading', { level: 4 })).toHaveTextContent('Sunset');
      expect(container.querySelector('svg.lucide-image')).toBeInTheDocument();
    });

    it('uses the kind icon and placeholder in the composer card', () => {
      const { container } = render(
        <LockedPostCard contentKind="file" price={null} editableTitle={{ value: '', onChange: vi.fn() }} />,
      );

      expect(screen.getByRole('textbox', { name: 'Lock title' })).toHaveAttribute('placeholder', 'Locked file');
      expect(container.querySelector('svg.lucide-download')).toBeInTheDocument();
    });
  });
});
