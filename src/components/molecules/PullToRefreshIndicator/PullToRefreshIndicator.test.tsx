import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { PullToRefreshIndicator } from './PullToRefreshIndicator';

// Mock next-intl
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => {
    const translations: Record<string, string> = {
      pullToRefresh: 'Pull to refresh',
      releaseToRefresh: 'Release to refresh',
      refreshing: 'Refreshing...',
    };
    return translations[key] || key;
  },
}));

describe('PullToRefreshIndicator', () => {
  describe('Rendering', () => {
    it('renders the indicator container when in pulling state', () => {
      render(<PullToRefreshIndicator state="pulling" pullDistance={50} />);

      expect(screen.getByTestId('pull-to-refresh-indicator')).toBeInTheDocument();
    });

    it('renders the pill element when visible', () => {
      render(<PullToRefreshIndicator state="pulling" pullDistance={50} />);

      expect(screen.getByTestId('pull-to-refresh-pill')).toBeInTheDocument();
    });

    it('renders the label text when visible', () => {
      render(<PullToRefreshIndicator state="pulling" pullDistance={50} />);

      expect(screen.getByTestId('pull-to-refresh-label')).toBeInTheDocument();
    });

    it('returns null when in idle state', () => {
      const { container } = render(<PullToRefreshIndicator state="idle" pullDistance={0} />);

      expect(container.firstChild).toBeNull();
    });
  });

  describe('State-based behavior', () => {
    it('shows "Pull to refresh" text in pulling state', () => {
      render(<PullToRefreshIndicator state="pulling" pullDistance={50} />);

      expect(screen.getByTestId('pull-to-refresh-label')).toHaveTextContent('Pull to refresh');
    });

    it('shows "Release to refresh" text in ready state', () => {
      render(<PullToRefreshIndicator state="ready" pullDistance={80} />);

      expect(screen.getByTestId('pull-to-refresh-label')).toHaveTextContent('Release to refresh');
    });

    it('shows "Refreshing..." text in refreshing state', () => {
      render(<PullToRefreshIndicator state="refreshing" pullDistance={56} />);

      expect(screen.getByTestId('pull-to-refresh-label')).toHaveTextContent('Refreshing...');
    });
  });

  describe('Arrow icon', () => {
    it('shows arrow icon in pulling state', () => {
      render(<PullToRefreshIndicator state="pulling" pullDistance={50} />);

      expect(screen.getByTestId('pull-to-refresh-arrow')).toBeInTheDocument();
    });

    it('shows arrow icon in ready state with rotation', () => {
      render(<PullToRefreshIndicator state="ready" pullDistance={80} />);

      const arrow = screen.getByTestId('pull-to-refresh-arrow');
      expect(arrow).toBeInTheDocument();
      expect(arrow).toHaveClass('rotate-180');
    });

    it('does not rotate arrow in pulling state', () => {
      render(<PullToRefreshIndicator state="pulling" pullDistance={50} />);

      const arrow = screen.getByTestId('pull-to-refresh-arrow');
      expect(arrow).not.toHaveClass('rotate-180');
    });

    it('hides arrow icon in refreshing state', () => {
      render(<PullToRefreshIndicator state="refreshing" pullDistance={56} />);

      expect(screen.queryByTestId('pull-to-refresh-arrow')).not.toBeInTheDocument();
    });
  });

  describe('Spinner', () => {
    it('shows spinner in refreshing state', () => {
      render(<PullToRefreshIndicator state="refreshing" pullDistance={56} />);

      expect(screen.getByTestId('pull-to-refresh-spinner')).toBeInTheDocument();
    });

    it('hides spinner in pulling state', () => {
      render(<PullToRefreshIndicator state="pulling" pullDistance={50} />);

      expect(screen.queryByTestId('pull-to-refresh-spinner')).not.toBeInTheDocument();
    });

    it('hides spinner in ready state', () => {
      render(<PullToRefreshIndicator state="ready" pullDistance={80} />);

      expect(screen.queryByTestId('pull-to-refresh-spinner')).not.toBeInTheDocument();
    });
  });

  describe('Visibility based on state', () => {
    it('renders when in pulling state', () => {
      render(<PullToRefreshIndicator state="pulling" pullDistance={50} />);

      expect(screen.getByTestId('pull-to-refresh-indicator')).toBeInTheDocument();
    });

    it('renders when in ready state', () => {
      render(<PullToRefreshIndicator state="ready" pullDistance={80} />);

      expect(screen.getByTestId('pull-to-refresh-indicator')).toBeInTheDocument();
    });

    it('renders when in refreshing state', () => {
      render(<PullToRefreshIndicator state="refreshing" pullDistance={56} />);

      expect(screen.getByTestId('pull-to-refresh-indicator')).toBeInTheDocument();
    });

    it('does not render when in idle state', () => {
      const { container } = render(<PullToRefreshIndicator state="idle" pullDistance={0} />);

      expect(container.firstChild).toBeNull();
    });
  });

  describe('Accessibility', () => {
    it('has aria-hidden false when visible', () => {
      render(<PullToRefreshIndicator state="pulling" pullDistance={50} />);

      const indicator = screen.getByTestId('pull-to-refresh-indicator');
      expect(indicator).toHaveAttribute('aria-hidden', 'false');
    });

    it('has aria-hidden false when refreshing', () => {
      render(<PullToRefreshIndicator state="refreshing" pullDistance={56} />);

      const indicator = screen.getByTestId('pull-to-refresh-indicator');
      expect(indicator).toHaveAttribute('aria-hidden', 'false');
    });
  });
});

describe('PullToRefreshIndicator - Snapshots', () => {
  it('matches snapshot when idle (returns null)', () => {
    const { container } = render(<PullToRefreshIndicator state="idle" pullDistance={0} />);
    expect(container).toMatchSnapshot();
  });

  it('matches snapshot in pulling state', () => {
    const { container } = render(<PullToRefreshIndicator state="pulling" pullDistance={50} />);
    expect(container).toMatchSnapshot();
  });

  it('matches snapshot in ready state', () => {
    const { container } = render(<PullToRefreshIndicator state="ready" pullDistance={80} />);
    expect(container).toMatchSnapshot();
  });

  it('matches snapshot in refreshing state', () => {
    const { container } = render(<PullToRefreshIndicator state="refreshing" pullDistance={56} />);
    expect(container).toMatchSnapshot();
  });
});
