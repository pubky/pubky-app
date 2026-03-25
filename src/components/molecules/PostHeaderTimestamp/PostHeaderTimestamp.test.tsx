import type { ReactElement } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as Atoms from '@/atoms';
import { PostHeaderTimestamp } from './PostHeaderTimestamp';

const TEST_DATE = new Date('2025-06-01T12:00:00Z');

const { mockUseIsMobile } = vi.hoisted(() => ({
  mockUseIsMobile: vi.fn(() => true),
}));

vi.mock('@/hooks/useIsMobile', () => ({
  useIsMobile: () => mockUseIsMobile(),
}));

vi.mock('@/atoms', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/atoms')>();
  return {
    ...actual,
    Container: ({ children, className }: { children: React.ReactNode; className?: string }) => (
      <div data-testid="container" className={className}>
        {children}
      </div>
    ),
    Typography: ({
      children,
      as: Tag = 'p',
      className,
    }: {
      children: React.ReactNode;
      as?: React.ElementType;
      className?: string;
    }) => (
      <Tag data-testid="typography" className={className}>
        {children}
      </Tag>
    ),
  };
});

vi.mock('@/libs', async (importOriginal) => {
  const mod = await importOriginal<typeof import('@/libs')>();
  return {
    ...mod,
    Clock: vi.fn(({ className }: { className?: string }) => <svg data-testid="clock-icon" className={className} />),
  };
});

function renderWithTooltip(ui: ReactElement) {
  return render(<Atoms.TooltipProvider delayDuration={0}>{ui}</Atoms.TooltipProvider>);
}

describe('PostHeaderTimestamp', () => {
  beforeEach(() => {
    mockUseIsMobile.mockReset();
    mockUseIsMobile.mockReturnValue(true);
  });

  it('renders timeAgo text', () => {
    render(<PostHeaderTimestamp timeAgo="2h" indexedAt={TEST_DATE} />);

    expect(screen.getByText('2h')).toBeInTheDocument();
  });

  it('renders clock icon', () => {
    render(<PostHeaderTimestamp timeAgo="2h" indexedAt={TEST_DATE} />);

    expect(screen.getByTestId('clock-icon')).toBeInTheDocument();
  });

  it('applies correct styling classes', () => {
    render(<PostHeaderTimestamp timeAgo="5m" indexedAt={TEST_DATE} />);

    const clockIcon = screen.getByTestId('clock-icon');
    expect(clockIcon).toHaveClass('size-4', 'text-muted-foreground');
  });

  it('renders different timeAgo values', () => {
    const { rerender } = render(<PostHeaderTimestamp timeAgo="1m" indexedAt={TEST_DATE} />);
    expect(screen.getByText('1m')).toBeInTheDocument();

    rerender(<PostHeaderTimestamp timeAgo="3d" indexedAt={TEST_DATE} />);
    expect(screen.getByText('3d')).toBeInTheDocument();

    rerender(<PostHeaderTimestamp timeAgo="just now" indexedAt={TEST_DATE} />);
    expect(screen.getByText('just now')).toBeInTheDocument();
  });

  it('shows exact time in tooltip on non-mobile after hover', async () => {
    mockUseIsMobile.mockReturnValue(false);
    const user = userEvent.setup();

    renderWithTooltip(<PostHeaderTimestamp timeAgo="2h" indexedAt={TEST_DATE} />);

    await user.hover(screen.getByText('2h'));

    await waitFor(() => {
      expect(screen.getByRole('tooltip')).toBeInTheDocument();
    });
  });
});

describe('PostHeaderTimestamp - Snapshots', () => {
  beforeEach(() => {
    mockUseIsMobile.mockReset();
    mockUseIsMobile.mockReturnValue(true);
  });

  it('matches snapshot with hours', () => {
    const { container } = render(<PostHeaderTimestamp timeAgo="2h" indexedAt={TEST_DATE} />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with minutes', () => {
    const { container } = render(<PostHeaderTimestamp timeAgo="5m" indexedAt={TEST_DATE} />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with days', () => {
    const { container } = render(<PostHeaderTimestamp timeAgo="3d" indexedAt={TEST_DATE} />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with "just now"', () => {
    const { container } = render(<PostHeaderTimestamp timeAgo="just now" indexedAt={TEST_DATE} />);
    expect(container.firstChild).toMatchSnapshot();
  });
});
