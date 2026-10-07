import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { toast, type ToastOptions } from './toast';
import { TOAST_DURATION, TOAST_REMOVE_DELAY } from './toast.store';
import { Toaster } from './Toaster';

// Auto-dismiss plus removal delay — advancing past this empties the store.
const FULL_TOAST_LIFETIME = TOAST_DURATION + TOAST_REMOVE_DELAY;

const renderWithToast = (options: ToastOptions) => {
  const view = render(<Toaster />);
  act(() => {
    toast(options);
  });
  return view;
};

describe('Toaster', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    act(() => {
      vi.runAllTimers();
    });
    vi.useRealTimers();
  });

  it('should render empty when no toasts', () => {
    const { container } = render(<Toaster />);

    // Should render ToastProvider structure even with no toasts
    expect(container.firstChild).toBeTruthy();
  });

  it('should render toast without title when only description is provided', () => {
    renderWithToast({ description: 'Just a description' });

    expect(screen.getByText('Just a description')).toBeInTheDocument();
  });

  it('should wrap long description text instead of truncating', () => {
    const longDescription =
      'The file you are trying to upload exceeds the maximum allowed size of 100MB. Please reduce the file size and try again.';

    renderWithToast({ title: 'Upload Error', description: longDescription });

    const descriptionElement = screen.getByText(longDescription);
    expect(descriptionElement).toHaveClass('wrap-anywhere');
    expect(descriptionElement).not.toHaveClass('truncate');
  });

  it('should wrap long URL description when dismiss button is shown', () => {
    const longUrl = `https://pubky-ring-signer.example.com/auth?redirect=${'a'.repeat(120)}`;

    renderWithToast({ title: 'Link copied to clipboard', description: longUrl, dismissButton: true });

    expect(screen.getByText(longUrl)).toHaveClass('wrap-anywhere');
    expect(screen.getByRole('button', { name: 'OK' })).toBeInTheDocument();
  });

  it('should render dismiss button that dismisses the toast when dismissButton is true', () => {
    renderWithToast({ title: 'Success', description: 'Operation completed', dismissButton: true });

    const okButton = screen.getByRole('button', { name: 'OK' });
    expect(okButton).toBeInTheDocument();
    expect(okButton).toHaveClass('border-brand');

    fireEvent.click(okButton);
    // No timer advance: the dismissal must come from the click itself,
    // not from the auto-dismiss timer.
    expect(screen.queryByText('Success')).not.toBeInTheDocument();
  });

  it('should not render dismiss button when dismissButton is not set', () => {
    renderWithToast({ title: 'Simple toast' });

    expect(screen.queryByRole('button', { name: 'OK' })).not.toBeInTheDocument();
  });

  it('should apply error variant styles to dismiss ToastAction', () => {
    renderWithToast({ variant: 'error', title: 'Failed', description: 'Something went wrong', dismissButton: true });

    const okButton = screen.getByRole('button', { name: 'OK' });
    expect(okButton).toHaveClass('bg-toast-action-muted', 'text-foreground');
  });

  it('should render the generic Error title for error toasts without a title', () => {
    renderWithToast({ variant: 'error', description: 'Something went wrong' });

    expect(screen.getByText('Error')).toBeInTheDocument();
  });

  it.each([
    ['default', 'default'],
    ['error', 'error'],
    ['warning', 'warning'],
    ['info', 'info'],
  ] as const)('should render %s variant with icon and data-variant attribute', (variant, expectedVariant) => {
    const { container } = renderWithToast({ variant, title: `${variant} toast` });

    const toastElement = screen.getByText(`${variant} toast`).closest('[data-cy="toast"]');
    expect(toastElement).toHaveAttribute('data-variant', expectedVariant);
    expect(container.querySelector('svg[aria-hidden="true"]')).toBeInTheDocument();
  });

  it('should render an action descriptor and dismiss the toast when the action is clicked', () => {
    const handleActionClick = vi.fn();

    renderWithToast({
      title: 'Reposted',
      action: { label: 'Undo', altText: 'Undo', onClick: handleActionClick },
    });

    const actionButton = screen.getByRole('button', { name: 'Undo' });
    // Custom actions render muted on default-variant toasts (see Toaster.tsx)
    expect(actionButton).toHaveClass('bg-toast-action-muted');

    fireEvent.click(actionButton);
    expect(handleActionClick).toHaveBeenCalledTimes(1);
    // No timer advance: the dismissal must come from the click itself,
    // not from the auto-dismiss timer.
    expect(screen.queryByText('Reposted')).not.toBeInTheDocument();
  });

  it('should auto-dismiss and remove the toast after its full lifetime', () => {
    renderWithToast({ title: 'Ephemeral' });

    expect(screen.getByText('Ephemeral')).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(FULL_TOAST_LIFETIME);
    });
    expect(screen.queryByText('Ephemeral')).not.toBeInTheDocument();
  });
});

describe('Toaster - Snapshots', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    act(() => {
      vi.runAllTimers();
    });
    vi.useRealTimers();
  });

  it('matches snapshot for empty Toaster', () => {
    const { container } = render(<Toaster />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot for Toaster with single toast', () => {
    const { container } = renderWithToast({ title: 'Test Toast', description: 'This is a test toast message' });
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot for Toaster with title-only toast', () => {
    const { container } = renderWithToast({ title: 'Simple Toast' });
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot for Toaster with toast with action', () => {
    const { container } = renderWithToast({
      title: 'Toast with Action',
      description: 'This toast has an action button',
      action: { label: 'Undo', altText: 'Undo', onClick: () => {} },
    });
    expect(container.firstChild).toMatchSnapshot();
  });
});
