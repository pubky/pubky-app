import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { DialogAuthExpired } from './DialogAuthExpired';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => {
    const t: Record<string, string> = {
      title: 'QR code expired',
      description: 'This QR code is no longer active. Refresh to get a new one.',
      refresh: 'Refresh',
    };
    return t[key] ?? key;
  },
}));

vi.mock('@/atoms', () => ({
  Dialog: ({ children, open }: { children: React.ReactNode; open: boolean }) => (
    <div data-testid="dialog" data-open={open}>
      {children}
    </div>
  ),
  DialogContent: ({
    children,
    showCloseButton,
    hiddenTitle,
  }: {
    children: React.ReactNode;
    showCloseButton?: boolean;
    hiddenTitle?: string;
  }) => (
    <div data-testid="dialog-content" data-close={showCloseButton} data-hidden-title={hiddenTitle}>
      {children}
    </div>
  ),
  DialogHeader: ({ children }: { children: React.ReactNode }) => <div data-testid="dialog-header">{children}</div>,
  DialogTitle: ({ children }: { children: React.ReactNode }) => <h2 data-testid="dialog-title">{children}</h2>,
  Typography: ({ children }: { children: React.ReactNode }) => <p data-testid="dialog-description">{children}</p>,
  DialogFooter: ({ children }: { children: React.ReactNode }) => <div data-testid="dialog-footer">{children}</div>,
  Button: ({
    children,
    onClick,
    size,
  }: {
    children: React.ReactNode;
    onClick?: () => void;
    size?: string;
  }) => (
    <button data-testid="refresh-button" data-size={size} onClick={onClick}>
      {children}
    </button>
  ),
}));

describe('DialogAuthExpired', () => {
  it('renders title, description and refresh action when open', () => {
    render(<DialogAuthExpired open={true} onRefresh={vi.fn()} />);

    expect(screen.getByTestId('dialog')).toHaveAttribute('data-open', 'true');
    expect(screen.getByTestId('dialog-title')).toHaveTextContent('QR code expired');
    expect(screen.getByTestId('dialog-description')).toHaveTextContent(
      'This QR code is no longer active. Refresh to get a new one.',
    );
    expect(screen.getByTestId('refresh-button')).toHaveTextContent('Refresh');
  });

  it('calls onRefresh when refresh button is clicked', () => {
    const onRefresh = vi.fn();
    render(<DialogAuthExpired open={true} onRefresh={onRefresh} />);

    fireEvent.click(screen.getByTestId('refresh-button'));
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });
});

describe('DialogAuthExpired - Snapshots', () => {
  it('matches snapshot when open', () => {
    const { container } = render(<DialogAuthExpired open={true} onRefresh={vi.fn()} />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot when closed', () => {
    const { container } = render(<DialogAuthExpired open={false} onRefresh={vi.fn()} />);
    expect(container.firstChild).toMatchSnapshot();
  });
});
