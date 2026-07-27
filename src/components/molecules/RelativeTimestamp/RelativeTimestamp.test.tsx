import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@/atoms/Tooltip/Tooltip';
import { RelativeTimestamp } from './RelativeTimestamp';

const TEST_DATE = new Date('2025-06-01T12:00:00Z');
const EXPECTED_EXACT_LABEL = TEST_DATE.toLocaleString(undefined, {
  dateStyle: 'medium',
  timeStyle: 'medium',
});

vi.mock('@/atoms/Typography/Typography', () => {
  return {
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

function renderWithTooltip(ui: ReactElement) {
  return render(<TooltipProvider delayDuration={0}>{ui}</TooltipProvider>);
}

describe('RelativeTimestamp', () => {
  it('renders timeAgo text', () => {
    render(<RelativeTimestamp timeAgo="2h" date={TEST_DATE} isMobile />);

    expect(screen.getByText('2h')).toBeInTheDocument();
  });

  it('renders leading content', () => {
    render(
      <RelativeTimestamp timeAgo="2h" date={TEST_DATE} isMobile leading={<span data-testid="leading">clock</span>} />,
    );

    expect(screen.getByTestId('leading')).toBeInTheDocument();
  });

  it('does not show tooltip on mobile after hover', async () => {
    const user = userEvent.setup();

    renderWithTooltip(<RelativeTimestamp timeAgo="2h" date={TEST_DATE} isMobile />);

    await user.hover(screen.getByText('2h'));

    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  });

  it('shows exact date in tooltip on desktop after hover', async () => {
    const user = userEvent.setup();

    renderWithTooltip(<RelativeTimestamp timeAgo="2h" date={TEST_DATE} isMobile={false} />);

    await user.hover(screen.getByText('2h'));

    await waitFor(() => {
      expect(screen.getByRole('tooltip')).toHaveTextContent(EXPECTED_EXACT_LABEL);
    });
  });

  it('does not show tooltip when date is missing', async () => {
    const user = userEvent.setup();

    renderWithTooltip(<RelativeTimestamp timeAgo="2h" isMobile={false} />);

    await user.hover(screen.getByText('2h'));

    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  });
});

describe('RelativeTimestamp - Snapshots', () => {
  it('matches snapshot without tooltip', () => {
    const { container } = render(<RelativeTimestamp timeAgo="2h" date={TEST_DATE} isMobile className="text-xs" />);
    expect(container).toMatchSnapshot();
  });

  it('matches snapshot with leading content', () => {
    const { container } = render(
      <RelativeTimestamp timeAgo="5m" date={TEST_DATE} isMobile leading={<span data-testid="leading">icon</span>} />,
    );
    expect(container).toMatchSnapshot();
  });
});
