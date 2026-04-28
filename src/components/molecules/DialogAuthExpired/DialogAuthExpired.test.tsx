import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { DialogAuthExpired } from './DialogAuthExpired';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => {
    const t: Record<string, string> = {
      titleDesktop: 'QR code expired',
      descriptionDesktop: 'This QR code is no longer active. Refresh to get a new one.',
      titleMobile: 'Authorization session expired',
      descriptionMobile: 'Your authorization session is no longer active. Refresh to generate a new one and continue.',
      refresh: 'Refresh',
    };
    return t[key] ?? key;
  },
}));

vi.mock('@/hooks/useIsMobile/useIsMobile', () => ({
  useIsMobile: vi.fn(() => false),
}));

describe('DialogAuthExpired', () => {
  it('renders title, description and refresh action when open', () => {
    render(<DialogAuthExpired open={true} onRefresh={vi.fn()} />);

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getAllByRole('heading', { name: /QR code expired/i }).length).toBeGreaterThan(0);
    expect(screen.getAllByText('This QR code is no longer active. Refresh to get a new one.').length).toBeGreaterThan(
      0,
    );
    expect(screen.getByRole('button', { name: /Refresh/i })).toBeInTheDocument();
  });

  it('calls onRefresh when refresh button is clicked', () => {
    const onRefresh = vi.fn();
    render(<DialogAuthExpired open={true} onRefresh={onRefresh} />);

    fireEvent.click(screen.getByRole('button', { name: /Refresh/i }));
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it('disables refresh button when isLoading is true', () => {
    render(<DialogAuthExpired open={true} onRefresh={vi.fn()} isLoading={true} />);

    const refreshButton = screen.getByRole('button', { name: /Refresh/i });
    expect(refreshButton).toBeDisabled();
  });

  it('does not disable refresh button when isLoading is false', () => {
    render(<DialogAuthExpired open={true} onRefresh={vi.fn()} isLoading={false} />);

    const refreshButton = screen.getByRole('button', { name: /Refresh/i });
    expect(refreshButton).not.toBeDisabled();
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

  it('matches snapshot when open with isLoading', () => {
    const { container } = render(<DialogAuthExpired open={true} onRefresh={vi.fn()} isLoading={true} />);
    expect(container.firstChild).toMatchSnapshot();
  });
});
