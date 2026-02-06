import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RepostersOverlay } from './RepostersOverlay';

// Mock next-intl
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => {
    const translations: Record<string, string> = {
      reposters: 'Reposters',
    };
    return translations[key] || key;
  },
}));

// Mock atoms
vi.mock('@/atoms', () => ({
  Dialog: ({
    children,
    open,
    onOpenChange,
  }: {
    children: React.ReactNode;
    open?: boolean;
    onOpenChange?: (open: boolean) => void;
  }) => (
    <div data-testid="dialog" data-open={open} onClick={() => onOpenChange?.(false)}>
      {children}
    </div>
  ),
  DialogContent: ({
    children,
    className,
    onClick,
  }: {
    children: React.ReactNode;
    className?: string;
    onClick?: (e: React.MouseEvent) => void;
  }) => (
    <div data-testid="dialog-content" className={className} onClick={onClick}>
      {children}
    </div>
  ),
  DialogHeader: ({ children }: { children: React.ReactNode }) => <div data-testid="dialog-header">{children}</div>,
  DialogTitle: ({ children }: { children: React.ReactNode }) => <h2 data-testid="dialog-title">{children}</h2>,
  Sheet: ({
    children,
    open,
    onOpenChange,
  }: {
    children: React.ReactNode;
    open?: boolean;
    onOpenChange?: (open: boolean) => void;
  }) => (
    <div data-testid="sheet" data-open={open} onClick={() => onOpenChange?.(false)}>
      {children}
    </div>
  ),
  SheetContent: ({
    children,
    side,
    className,
    onClick,
  }: {
    children: React.ReactNode;
    side?: string;
    className?: string;
    onClick?: (e: React.MouseEvent) => void;
  }) => (
    <div data-testid="sheet-content" data-side={side} className={className} onClick={onClick}>
      {children}
    </div>
  ),
  SheetHeader: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <div data-testid="sheet-header" className={className}>
      {children}
    </div>
  ),
  SheetTitle: ({ children }: { children: React.ReactNode }) => <h2 data-testid="sheet-title">{children}</h2>,
}));

// Mock molecules
vi.mock('@/molecules', () => ({
  WhoTaggedExpandedList: ({
    taggers,
    className,
    'data-testid': dataTestId,
  }: {
    taggers: Array<{ id: string; name?: string; avatarUrl?: string }>;
    className?: string;
    'data-testid'?: string;
  }) => (
    <div data-testid={dataTestId || 'who-tagged-expanded-list'} data-count={taggers.length} className={className}>
      User List ({taggers.length} users)
    </div>
  ),
}));

describe('RepostersOverlay', () => {
  const mockReposters = [
    { id: 'user1', name: 'Alice', avatarUrl: 'https://example.com/alice.jpg' },
    { id: 'user2', name: 'Bob', avatarUrl: 'https://example.com/bob.jpg' },
    { id: 'user3', name: 'Charlie', avatarUrl: 'https://example.com/charlie.jpg' },
  ];

  const defaultProps = {
    open: true,
    onOpenChange: vi.fn(),
    reposters: mockReposters,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('dialog variant', () => {
    it('renders dialog with title "Reposters"', () => {
      render(<RepostersOverlay {...defaultProps} variant="dialog" />);

      expect(screen.getByTestId('dialog')).toBeInTheDocument();
      expect(screen.getByTestId('dialog-title')).toHaveTextContent('Reposters');
    });

    it('renders WhoTaggedExpandedList with reposters', () => {
      render(<RepostersOverlay {...defaultProps} variant="dialog" />);

      const list = screen.getByTestId('reposter-expanded-list');
      expect(list).toBeInTheDocument();
      expect(list).toHaveAttribute('data-count', '3');
    });

    it('passes open state to Dialog', () => {
      const { rerender } = render(<RepostersOverlay {...defaultProps} variant="dialog" open={false} />);

      expect(screen.getByTestId('dialog')).toHaveAttribute('data-open', 'false');

      rerender(<RepostersOverlay {...defaultProps} variant="dialog" open={true} />);
      expect(screen.getByTestId('dialog')).toHaveAttribute('data-open', 'true');
    });

    it('calls onOpenChange when dialog is closed', () => {
      const onOpenChange = vi.fn();
      render(<RepostersOverlay {...defaultProps} variant="dialog" onOpenChange={onOpenChange} />);

      fireEvent.click(screen.getByTestId('dialog'));
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });
  });

  describe('sheet variant', () => {
    it('renders sheet with title "Reposters"', () => {
      render(<RepostersOverlay {...defaultProps} variant="sheet" />);

      expect(screen.getByTestId('sheet')).toBeInTheDocument();
      expect(screen.getByTestId('sheet-title')).toHaveTextContent('Reposters');
    });

    it('renders with bottom side', () => {
      render(<RepostersOverlay {...defaultProps} variant="sheet" />);

      expect(screen.getByTestId('sheet-content')).toHaveAttribute('data-side', 'bottom');
    });

    it('renders WhoTaggedExpandedList with reposters', () => {
      render(<RepostersOverlay {...defaultProps} variant="sheet" />);

      const list = screen.getByTestId('reposter-expanded-list');
      expect(list).toBeInTheDocument();
      expect(list).toHaveAttribute('data-count', '3');
    });

    it('passes open state to Sheet', () => {
      const { rerender } = render(<RepostersOverlay {...defaultProps} variant="sheet" open={false} />);

      expect(screen.getByTestId('sheet')).toHaveAttribute('data-open', 'false');

      rerender(<RepostersOverlay {...defaultProps} variant="sheet" open={true} />);
      expect(screen.getByTestId('sheet')).toHaveAttribute('data-open', 'true');
    });

    it('calls onOpenChange when sheet is closed', () => {
      const onOpenChange = vi.fn();
      render(<RepostersOverlay {...defaultProps} variant="sheet" onOpenChange={onOpenChange} />);

      fireEvent.click(screen.getByTestId('sheet'));
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });

    it('has correct styling classes', () => {
      render(<RepostersOverlay {...defaultProps} variant="sheet" />);

      const content = screen.getByTestId('sheet-content');
      expect(content).toHaveClass('rounded-t-2xl');
      expect(content).toHaveClass('pb-8');
    });
  });
});

describe('RepostersOverlay - Snapshots', () => {
  const mockReposters = [
    { id: 'user1', name: 'Alice', avatarUrl: 'https://example.com/alice.jpg' },
    { id: 'user2', name: 'Bob', avatarUrl: 'https://example.com/bob.jpg' },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('matches snapshot for dialog variant when open', () => {
    const { container } = render(
      <RepostersOverlay variant="dialog" open={true} onOpenChange={vi.fn()} reposters={mockReposters} />,
    );
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot for dialog variant when closed', () => {
    const { container } = render(
      <RepostersOverlay variant="dialog" open={false} onOpenChange={vi.fn()} reposters={mockReposters} />,
    );
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot for sheet variant when open', () => {
    const { container } = render(
      <RepostersOverlay variant="sheet" open={true} onOpenChange={vi.fn()} reposters={mockReposters} />,
    );
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot for sheet variant when closed', () => {
    const { container } = render(
      <RepostersOverlay variant="sheet" open={false} onOpenChange={vi.fn()} reposters={mockReposters} />,
    );
    expect(container.firstChild).toMatchSnapshot();
  });
});
