import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { BalancedQrCard } from './BalancedQrCard';

describe('BalancedQrCard', () => {
  it('centers the content between equal-width desktop columns', () => {
    const { container } = render(
      <BalancedQrCard illustration={<span>Illustration</span>}>
        <span>QR code</span>
      </BalancedQrCard>,
    );

    expect(screen.getByText('Illustration').parentElement).toHaveClass('w-48', 'shrink-0');
    expect(screen.getByText('QR code').parentElement).toHaveClass('w-48', 'shrink-0', 'justify-center');
    expect(container.querySelector('[data-slot="balanced-qr-spacer"]')).toHaveClass('w-48', 'shrink-0');
  });
});

describe('BalancedQrCard - Snapshots', () => {
  it('matches snapshot', () => {
    const { container } = render(
      <BalancedQrCard illustration={<span>Illustration</span>}>
        <span>QR code</span>
      </BalancedQrCard>,
    );

    expect(container.firstChild).toMatchSnapshot();
  });
});
