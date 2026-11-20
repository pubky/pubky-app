import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { WalletScanner } from './WalletScanner';

const mediaDescriptor = Object.getOwnPropertyDescriptor(navigator, 'mediaDevices');
afterEach(() => {
  if (mediaDescriptor) Object.defineProperty(navigator, 'mediaDevices', mediaDescriptor);
  else Reflect.deleteProperty(navigator, 'mediaDevices');
});

it('offers local QR images and paste when camera permission is denied', async () => {
  const getUserMedia = vi.fn().mockRejectedValue(new DOMException('User declined', 'NotAllowedError'));
  Object.defineProperty(navigator, 'mediaDevices', { value: { getUserMedia }, configurable: true });
  const onRead = vi.fn();
  render(<WalletScanner onRead={onRead} />);
  expect(getUserMedia).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Scan QR' }));
  expect(await screen.findByRole('status')).toHaveTextContent('Choose a QR image or paste the payment request.');
  expect(screen.getByRole('button', { name: 'Choose QR image' })).toBeVisible();
  expect(onRead).not.toHaveBeenCalled();
});

it('stops tracks if a camera permission grant arrives after closing the scanner', async () => {
  const stop = vi.fn();
  let allow!: () => void;
  const grant = new Promise((resolve) => {
    allow = () => resolve({ getTracks: () => [{ stop }] });
  });
  Object.defineProperty(navigator, 'mediaDevices', { value: { getUserMedia: () => grant }, configurable: true });
  render(<WalletScanner onRead={vi.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: 'Scan QR' }));
  fireEvent.click(screen.getByRole('button', { name: 'Stop camera' }));
  await act(async () => allow());
  expect(stop).toHaveBeenCalledTimes(1);
});
