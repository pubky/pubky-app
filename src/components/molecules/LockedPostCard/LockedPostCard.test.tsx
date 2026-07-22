import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { LockedPostCard, SLIDE_MS } from './LockedPostCard';

describe('LockedPostCard', () => {
  it('falls back to the default title while the creator has not typed one', () => {
    render(<LockedPostCard title="" />);
    expect(screen.getByRole('heading', { level: 4 })).toHaveTextContent('Locked post');
  });

  it('falls back to the default title for a whitespace-only title', () => {
    render(<LockedPostCard title="   " />);
    expect(screen.getByRole('heading', { level: 4 })).toHaveTextContent('Locked post');
  });

  it('shows the creator-typed title', () => {
    render(<LockedPostCard title="My most famous quote" />);
    expect(screen.getByRole('heading', { level: 4 })).toHaveTextContent('My most famous quote');
  });

  // Composer preview: no `onUnlock`, so the lock (which does not exist until Post) cannot be opened.
  it('renders the Unlock control as inert without an onUnlock handler', () => {
    render(<LockedPostCard title="" />);
    expect(screen.getByRole('button', { name: 'Unlock' })).toBeDisabled();
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

  it('swaps the icon (StickyNote → Check) while the title is being edited', () => {
    render(<LockedPostCard title="" editableTitle={{ value: '', onChange: vi.fn() }} />);
    const input = screen.getByRole('textbox', { name: 'Lock title' });

    expect(document.querySelector('.lucide-sticky-note')).toBeInTheDocument();
    expect(document.querySelector('.lucide-check')).not.toBeInTheDocument();

    fireEvent.focus(input);
    expect(document.querySelector('.lucide-check')).toBeInTheDocument();
    expect(document.querySelector('.lucide-sticky-note')).not.toBeInTheDocument();

    fireEvent.blur(input);
    expect(document.querySelector('.lucide-check')).not.toBeInTheDocument();
  });

  it('shows a static, non-editable title in reader mode', () => {
    render(<LockedPostCard title="Secret" />);
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 4 })).toHaveTextContent('Secret');
  });
});
