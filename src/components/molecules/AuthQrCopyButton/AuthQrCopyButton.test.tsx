import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { toast } from '@/molecules/Toaster/toast';
import { AuthQrCopyButton } from './AuthQrCopyButton';
import type { AuthQrCopyButtonProps } from './AuthQrCopyButton.types';

vi.mock('next/image', () => ({
  __esModule: true,
  default: ({ src, alt }: { src: string; alt: string }) => <img data-testid="next-image" src={src} alt={alt} />,
}));

vi.mock('qrcode.react', () => ({
  QRCodeSVG: ({ value }: { value: string }) => <svg data-testid="qr-code" data-value={value} />,
}));

vi.mock('@/molecules/Toaster/toast');

vi.mock('@/libs/logger/logger', () => ({
  Logger: { error: vi.fn() },
}));

const onCopy = vi.fn<() => Promise<void>>();
const onReload = vi.fn();

const renderButton = (props: Partial<AuthQrCopyButtonProps> = {}) =>
  render(
    <AuthQrCopyButton
      url="pubkyauth://signup?hs=example"
      isLoading={false}
      isExpired={false}
      onCopy={onCopy}
      onReload={onReload}
      reloadAriaLabel="Reload sign-up QR code"
      {...props}
    />,
  );

describe('AuthQrCopyButton', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    onCopy.mockResolvedValue(undefined);
  });

  it('renders the auth URL as a QR code inside the copy button', () => {
    renderButton();

    const button = screen.getByRole('button', { name: 'Copy authentication link' });
    expect(button).toBeEnabled();
    expect(screen.getByTestId('qr-code')).toHaveAttribute('data-value', 'pubkyauth://signup?hs=example');
  });

  it('copies the link and confirms with an info toast', async () => {
    renderButton();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Copy authentication link' }));
    });

    expect(onCopy).toHaveBeenCalledTimes(1);
    expect(onReload).not.toHaveBeenCalled();
    expect(toast).toHaveBeenCalledWith({ variant: 'info', title: 'Authentication link copied' });
  });

  it('shows an error toast when the copy fails', async () => {
    onCopy.mockRejectedValueOnce(new Error('clipboard denied'));
    renderButton();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Copy authentication link' }));
    });

    expect(toast).toHaveBeenCalledTimes(1);
    expect(toast).toHaveBeenCalledWith({ variant: 'error', description: 'Could not copy to clipboard' });
  });

  it('reloads instead of copying once the link has expired', () => {
    renderButton({ url: '', isExpired: true });

    fireEvent.click(screen.getByRole('button', { name: 'Reload sign-up QR code' }));

    expect(onReload).toHaveBeenCalledTimes(1);
    expect(onCopy).not.toHaveBeenCalled();
    expect(screen.getByText('Click to reload')).toBeInTheDocument();
  });

  it.each([
    { name: 'loading', props: { url: '', isLoading: true } },
    { name: 'missing a URL', props: { url: '' } },
    { name: 'locked by the caller', props: { disabled: true } },
  ])('is disabled while $name', ({ props }) => {
    renderButton(props);

    const button = screen.getByRole('button', { name: 'Copy authentication link' });
    expect(button).toBeDisabled();
    fireEvent.click(button);
    expect(onCopy).not.toHaveBeenCalled();
  });
});
