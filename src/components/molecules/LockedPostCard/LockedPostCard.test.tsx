import { type ComponentProps } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PostPreviewNestingProvider } from '@/molecules/PostPreviewCard/PostPreviewNestingContext';
import { stubUnlockSlideGeometry } from '@/test-utils/locks';
import { LockedPostCard, SLIDE_MS } from './LockedPostCard';

type LockedPostCardProps = ComponentProps<typeof LockedPostCard>;

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

  describe('dragging Unlock', () => {
    // A 120px slide: 90% of it is 108px.
    let restoreGeometry: () => void;
    beforeEach(() => {
      vi.useFakeTimers();
      restoreGeometry = stubUnlockSlideGeometry();
    });

    afterEach(() => {
      restoreGeometry();
      vi.useRealTimers();
    });

    const renderUnlock = (props: Partial<LockedPostCardProps> = {}) => {
      const onUnlock = vi.fn();
      const view = render(<LockedPostCard title="" onUnlock={onUnlock} {...props} />);
      return { onUnlock, button: screen.getByRole('button', { name: 'Unlock' }), ...view };
    };
    const pointer = (clientX: number, overrides: PointerEventInit = {}) => ({
      pointerId: 1,
      isPrimary: true,
      clientX,
      clientY: 0,
      ...overrides,
    });
    const press = (button: HTMLElement) => fireEvent.pointerDown(button, pointer(0));
    const moveTo = (button: HTMLElement, x: number) => fireEvent.pointerMove(button, pointer(x));
    const release = (button: HTMLElement, x: number) => fireEvent.pointerUp(button, pointer(x));
    const drag = (button: HTMLElement, x: number) => {
      press(button);
      moveTo(button, x);
      release(button, x);
    };
    // What a browser sends after a mouse drag; a keyboard press has `detail` 0, `fireEvent.click`'s default.
    const pointerClick = (button: HTMLElement) => fireEvent.click(button, { detail: 1 });

    it.each([108, 120])('unlocks once on a release at %ipx, with the same slide as a click', (x) => {
      const { onUnlock, button } = renderUnlock();

      drag(button, x);
      pointerClick(button);

      expect(button).toHaveStyle({ transform: 'translateX(120px)' });
      expect(onUnlock).not.toHaveBeenCalled();
      vi.advanceTimersByTime(SLIDE_MS);
      expect(onUnlock).toHaveBeenCalledTimes(1);
    });

    it('slides back on a release before 90%, and the click after it does not unlock', () => {
      const { onUnlock, button } = renderUnlock();

      drag(button, 107);
      pointerClick(button);

      expect(button).toHaveStyle({ transform: 'translateX(0px)' });
      vi.advanceTimersByTime(SLIDE_MS);
      expect(onUnlock).not.toHaveBeenCalled();
    });

    it('follows the pointer without a transition, inside the slide', () => {
      const { button } = renderUnlock();

      press(button);
      moveTo(button, 60);
      expect(button).toHaveStyle({ transform: 'translateX(60px)', transitionDuration: '0ms' });
      moveTo(button, 500);
      expect(button).toHaveStyle({ transform: 'translateX(120px)' });
      moveTo(button, -50);
      expect(button).toHaveStyle({ transform: 'translateX(0px)' });

      release(button, -50);
      expect(button).toHaveStyle({ transitionDuration: `${SLIDE_MS}ms` });
    });

    it('still treats a press that barely moves as a click', () => {
      const { onUnlock, button } = renderUnlock();

      press(button);
      moveTo(button, 10);
      expect(button).toHaveStyle({ transform: 'translateX(0px)' });
      release(button, 10);
      pointerClick(button);

      expect(button).toHaveStyle({ transform: 'translateX(120px)' });
      vi.advanceTimersByTime(SLIDE_MS);
      expect(onUnlock).toHaveBeenCalledTimes(1);
    });

    // Only a modal closing snaps the button back, and a signed-out reader gets no modal.
    it('returns the button by itself and unlocks at once when no modal follows', () => {
      const { onUnlock, button } = renderUnlock({ slideOnUnlock: false });

      drag(button, 120);
      pointerClick(button);

      expect(onUnlock).toHaveBeenCalledTimes(1);
      expect(button).toHaveStyle({ transform: 'translateX(0px)' });
    });

    // A touch drag sends no click, so nothing consumes the mark it leaves.
    it('unlocks from the keyboard after a touch drag', () => {
      const { onUnlock, button } = renderUnlock();

      drag(button, 50);
      fireEvent.click(button);

      vi.advanceTimersByTime(SLIDE_MS);
      expect(onUnlock).toHaveBeenCalledTimes(1);
    });

    it('unlocks from the next tap after a touch drag', () => {
      const { onUnlock, button } = renderUnlock();

      drag(button, 50);
      press(button);
      release(button, 0);
      pointerClick(button);

      vi.advanceTimersByTime(SLIDE_MS);
      expect(onUnlock).toHaveBeenCalledTimes(1);
    });

    it('captures the pointer so the drag keeps following it off the button', () => {
      const { button } = renderUnlock();
      const capture = vi.fn();
      button.setPointerCapture = capture;

      press(button);

      expect(capture).toHaveBeenCalledWith(1);
    });

    // Capture throws for a pointer the browser does not count as active, such as one from a synthetic press. The
    // error would reach the page as an uncaught error.
    it('reports no error and still unlocks on a click when the pointer cannot be captured', () => {
      const { onUnlock, button } = renderUnlock();
      button.setPointerCapture = () => {
        throw new DOMException('No active pointer', 'NotFoundError');
      };
      const onError = vi.fn();
      window.addEventListener('error', onError);

      try {
        press(button);
        release(button, 0);
        pointerClick(button);
      } finally {
        window.removeEventListener('error', onError);
      }

      expect(onError).not.toHaveBeenCalled();
      vi.advanceTimersByTime(SLIDE_MS);
      expect(onUnlock).toHaveBeenCalledTimes(1);
    });

    it('unlocks once when a keyboard press lands during a drag that then reaches the end', () => {
      const { onUnlock, button, unmount } = renderUnlock();

      press(button);
      moveTo(button, 60);
      fireEvent.click(button);
      moveTo(button, 120);
      release(button, 120);
      pointerClick(button);

      vi.advanceTimersByTime(SLIDE_MS);
      expect(onUnlock).toHaveBeenCalledTimes(1);
      unmount();
      vi.advanceTimersByTime(SLIDE_MS);
      expect(onUnlock).toHaveBeenCalledTimes(1);
    });

    // An assistive technology can send a click with no pointerdown before it.
    it('unlocks on a click without a pointerdown after a drag the browser cancelled', () => {
      const { onUnlock, button } = renderUnlock();

      press(button);
      moveTo(button, 60);
      fireEvent.pointerCancel(button, pointer(60));
      pointerClick(button);

      vi.advanceTimersByTime(SLIDE_MS);
      expect(onUnlock).toHaveBeenCalledTimes(1);
    });

    it('slides back without unlocking when the browser cancels the press to scroll', () => {
      const { onUnlock, button } = renderUnlock();

      press(button);
      moveTo(button, 120);
      fireEvent.pointerCancel(button, pointer(120));

      expect(button).toHaveStyle({ transform: 'translateX(0px)' });
      vi.advanceTimersByTime(SLIDE_MS);
      expect(onUnlock).not.toHaveBeenCalled();
    });

    it('keeps following the first finger when a second one lands', () => {
      const { onUnlock, button } = renderUnlock();
      const secondFinger = { pointerId: 2, isPrimary: false };

      press(button);
      moveTo(button, 60);
      fireEvent.pointerDown(button, pointer(0, secondFinger));
      fireEvent.pointerMove(button, pointer(120, secondFinger));
      fireEvent.pointerUp(button, pointer(120, secondFinger));
      expect(button).toHaveStyle({ transform: 'translateX(60px)' });

      release(button, 60);
      expect(button).toHaveStyle({ transform: 'translateX(0px)' });
      vi.advanceTimersByTime(SLIDE_MS);
      expect(onUnlock).not.toHaveBeenCalled();
    });

    it('ignores a press with another mouse button', () => {
      const { button } = renderUnlock();

      fireEvent.pointerDown(button, pointer(0, { button: 2 }));
      moveTo(button, 60);

      expect(button).toHaveStyle({ transform: 'translateX(0px)' });
    });

    it('ignores a drag while the slide from a click is running', () => {
      const { onUnlock, button } = renderUnlock();

      pointerClick(button);
      drag(button, 50);

      expect(button).toHaveStyle({ transform: 'translateX(120px)' });
      vi.advanceTimersByTime(SLIDE_MS);
      expect(onUnlock).toHaveBeenCalledTimes(1);
    });

    it.each([
      ['disabled', { disabled: true }],
      ['loading', { isLoading: true }],
    ])('does not drag while %s', (_state, props) => {
      const { onUnlock, button } = renderUnlock(props);

      drag(button, 120);

      expect(button).toHaveStyle({ transform: 'translateX(0px)' });
      vi.advanceTimersByTime(SLIDE_MS);
      expect(onUnlock).not.toHaveBeenCalled();
    });

    it('slides back without unlocking when the control turns disabled during a drag', () => {
      const { onUnlock, button, rerender } = renderUnlock();

      press(button);
      moveTo(button, 120);
      rerender(<LockedPostCard title="" onUnlock={onUnlock} disabled />);
      expect(button).toHaveStyle({ transform: 'translateX(0px)' });

      release(button, 120);
      vi.advanceTimersByTime(SLIDE_MS);
      expect(onUnlock).not.toHaveBeenCalled();
    });
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
