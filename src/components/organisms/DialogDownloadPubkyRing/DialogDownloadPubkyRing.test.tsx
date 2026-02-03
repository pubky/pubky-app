import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DialogDownloadPubkyRing } from './DialogDownloadPubkyRing';

// Mock Next.js Image component
vi.mock('next/image', () => ({
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
  }) => <img src={src} alt={alt} width={width} height={height} className={className} data-testid="next-image" />,
}));

// Mock atoms
vi.mock('@/atoms', () => ({
  Dialog: ({ children }: { children: React.ReactNode }) => <div data-testid="dialog">{children}</div>,
  DialogContent: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <div data-testid="dialog-content" className={className}>
      {children}
    </div>
  ),
  DialogHeader: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <div data-testid="dialog-header" className={className}>
      {children}
    </div>
  ),
  DialogTitle: ({ children }: { children: React.ReactNode }) => <h2 data-testid="dialog-title">{children}</h2>,
  DialogDescription: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <p data-testid="dialog-description" className={className}>
      {children}
    </p>
  ),
  DialogTrigger: ({ children, asChild }: { children: React.ReactNode; asChild?: boolean }) => (
    <div data-testid="dialog-trigger" data-as-child={asChild}>
      {children}
    </div>
  ),
  Link: ({
    children,
    href,
    className,
    target,
  }: {
    children: React.ReactNode;
    href: string;
    className?: string;
    target?: string;
  }) => (
    <a data-testid="link" href={href} className={className} target={target}>
      {children}
    </a>
  ),
  Container: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <div data-testid="container" className={className}>
      {children}
    </div>
  ),
}));

describe('DialogDownloadPubkyRing', () => {
  it('renders apple store version with default props', () => {
    render(<DialogDownloadPubkyRing store="apple" />);

    const dialog = screen.getByTestId('dialog');
    const trigger = screen.getByTestId('dialog-trigger');
    const content = screen.getByTestId('dialog-content');

    expect(dialog).toBeInTheDocument();
    expect(trigger).toBeInTheDocument();
    expect(content).toBeInTheDocument();
  });

  it('renders android store version with default props', () => {
    render(<DialogDownloadPubkyRing store="android" />);

    const dialog = screen.getByTestId('dialog');
    const trigger = screen.getByTestId('dialog-trigger');
    const content = screen.getByTestId('dialog-content');

    expect(dialog).toBeInTheDocument();
    expect(trigger).toBeInTheDocument();
    expect(content).toBeInTheDocument();
  });

  it('renders QR code section', () => {
    render(<DialogDownloadPubkyRing store="apple" />);

    // QR code placeholder or actual QR code should be present
    const qrSection = document.querySelector('.w-\\[192px\\].h-\\[192px\\]');
    expect(qrSection).toBeInTheDocument();
  });

  it('handles image badge prop correctly for each store', () => {
    const { rerender } = render(<DialogDownloadPubkyRing store="apple" />);

    let images = screen.getAllByTestId('next-image');
    const appleBadge = images.find((img) => img.getAttribute('src') === '/images/badge-apple.webp');
    expect(appleBadge).toBeInTheDocument();

    rerender(<DialogDownloadPubkyRing store="android" />);

    images = screen.getAllByTestId('next-image');
    const androidBadge = images.find((img) => img.getAttribute('src') === '/images/badge-android.webp');
    expect(androidBadge).toBeInTheDocument();
  });
});

describe('DialogDownloadPubkyRing - Snapshots', () => {
  it('matches snapshot for apple store DialogDownloadPubkyRing', () => {
    const { container } = render(<DialogDownloadPubkyRing store="apple" />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot for android store DialogDownloadPubkyRing', () => {
    const { container } = render(<DialogDownloadPubkyRing store="android" />);
    expect(container.firstChild).toMatchSnapshot();
  });
});
