import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { QrCodeSlot } from './QrCodeSlot';

vi.mock('next/image', () => ({
  __esModule: true,
  default: ({
    src,
    alt,
    width,
    height,
    className,
  }: {
    src: string;
    alt: string;
    width: number;
    height: number;
    className?: string;
  }) => <img data-testid="next-image" src={src} alt={alt} width={width} height={height} className={className} />,
}));

vi.mock('qrcode.react', () => ({
  QRCodeSVG: ({ value, size, className }: { value: string; size: number; className?: string }) => (
    <svg data-testid="qrcode-svg" data-value={value} width={size} height={size} className={className} />
  ),
}));

vi.mock('@/atoms/Container/Container', () => ({
  Container: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <div data-testid="container" className={className}>
      {children}
    </div>
  ),
}));

vi.mock('@/atoms/Typography/Typography', () => ({
  Typography: ({
    children,
    as,
    className,
  }: {
    children: React.ReactNode;
    as?: React.ElementType;
    className?: string;
  }) => {
    const Tag = as || 'span';
    return React.createElement(Tag, { 'data-testid': 'typography', className }, children);
  },
}));

const baseProps = {
  isLoading: false,
  isExpired: false,
  url: 'auth-url',
  generatingLabel: 'Generating...',
  clickToReloadLabel: 'Click to reload',
};

describe('QrCodeSlot', () => {
  it('renders loader and generating label when loading', () => {
    render(<QrCodeSlot {...baseProps} isLoading url="" />);

    expect(screen.getByText('Generating...')).toBeInTheDocument();
    expect(screen.queryByTestId('qrcode-svg')).not.toBeInTheDocument();
  });

  it('renders loader when url is empty and not yet expired', () => {
    render(<QrCodeSlot {...baseProps} url="" />);

    expect(screen.getByText('Generating...')).toBeInTheDocument();
  });

  it('renders QRCodeSVG and ring logo when url is available', () => {
    render(<QrCodeSlot {...baseProps} />);

    const qr = screen.getByTestId('qrcode-svg');
    expect(qr).toHaveAttribute('data-value', 'auth-url');
    expect(qr).toHaveAttribute('width', '176');

    const ringLogo = screen.getByAltText('Pubky Ring');
    expect(ringLogo).toHaveAttribute('src', '/images/ring-logo.svg');
    expect(ringLogo).toHaveAttribute('width', '48');
  });

  it('scales the QR code and ring logo for a non-default size', () => {
    render(<QrCodeSlot {...baseProps} size={220} />);

    expect(screen.getByTestId('qrcode-svg')).toHaveAttribute('width', '220');
    expect(screen.getByAltText('Pubky Ring')).toHaveAttribute('width', '60');
  });

  it('omits hover transitions on active QR by default', () => {
    render(<QrCodeSlot {...baseProps} />);

    expect(screen.getByTestId('qrcode-svg').getAttribute('class') ?? '').not.toContain('group-hover');
    expect(screen.getByAltText('Pubky Ring').getAttribute('class') ?? '').not.toContain('group-hover');
  });

  it('adds hover transitions on active QR when activeQrHasHoverEffect is true', () => {
    render(<QrCodeSlot {...baseProps} activeQrHasHoverEffect />);

    expect(screen.getByTestId('qrcode-svg').getAttribute('class') ?? '').toContain('group-hover:opacity-90');
    expect(screen.getByAltText('Pubky Ring').getAttribute('class') ?? '').toContain('group-hover:opacity-90');
  });

  it('renders blurred QR + reload label without inline button when no reload action', () => {
    render(<QrCodeSlot {...baseProps} url="" isExpired />);

    const blurred = screen.getByTestId('next-image');
    expect(blurred).toHaveAttribute('src', '/images/qr-blurred.png');
    expect(screen.getByText('Click to reload')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('wraps expired state in inline button when reload action is provided', () => {
    const onClick = vi.fn();
    render(<QrCodeSlot {...baseProps} url="" isExpired expiredReloadAction={{ onClick, ariaLabel: 'Reload QR' }} />);

    const reloadButton = screen.getByRole('button', { name: 'Reload QR' });
    expect(reloadButton).toBeInTheDocument();

    fireEvent.click(reloadButton);
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});

describe('QrCodeSlot - Snapshots', () => {
  it('matches snapshot for loading state', () => {
    const { container } = render(<QrCodeSlot {...baseProps} isLoading url="" />);
    expect(container).toMatchSnapshot();
  });

  it('matches snapshot for active QR without hover effect', () => {
    const { container } = render(<QrCodeSlot {...baseProps} />);
    expect(container).toMatchSnapshot();
  });

  it('matches snapshot for active QR with hover effect', () => {
    const { container } = render(<QrCodeSlot {...baseProps} activeQrHasHoverEffect />);
    expect(container).toMatchSnapshot();
  });

  it('matches snapshot for a non-default size', () => {
    const { container } = render(<QrCodeSlot {...baseProps} size={220} />);
    expect(container).toMatchSnapshot();
  });

  it('matches snapshot for expired state without inline reload button', () => {
    const { container } = render(<QrCodeSlot {...baseProps} url="" isExpired />);
    expect(container).toMatchSnapshot();
  });

  it('matches snapshot for expired state with inline reload button', () => {
    const { container } = render(
      <QrCodeSlot
        {...baseProps}
        url=""
        isExpired
        expiredReloadAction={{ onClick: () => {}, ariaLabel: 'Reload QR' }}
      />,
    );
    expect(container).toMatchSnapshot();
  });
});
