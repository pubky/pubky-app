import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { HotTags } from './HotTags';

// Mock next/navigation
const mockPush = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
  }),
}));

// Mock hooks
const mockTags = [
  { name: 'bitcoin', count: 16 },
  { name: 'keys', count: 176 },
  { name: 'pubky', count: 149 },
  { name: 'autonomy', count: 89 },
  { name: 'satoshi', count: 45 },
  { name: 'ethereum', count: 32 },
];
const mockUseHotTags = vi.fn();

vi.mock('@/hooks/useHotTags/useHotTags', () => ({
  useHotTags: () => mockUseHotTags(),
}));

// Mock molecules
vi.mock('@/molecules', () => ({
  SidebarSection: ({
    children,
    title,
    footerText,
    onFooterClick,
    footerTestId,
  }: {
    children: React.ReactNode;
    title: string;
    footerText: string;
    onFooterClick?: () => void;
    footerTestId?: string;
  }) => (
    <div data-testid="sidebar-section">
      <h3>{title}</h3>
      {children}
      <button data-testid={footerTestId} onClick={onFooterClick}>
        {footerText}
      </button>
    </div>
  ),
}));

// Mock atoms
vi.mock('@/atoms', () => ({
  Container: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <div className={className}>{children}</div>
  ),
  Skeleton: ({ className, 'data-testid': testId }: { className?: string; 'data-testid'?: string }) => (
    <div data-testid={testId} className={className} />
  ),
  Typography: ({ children }: { children: React.ReactNode }) => <p>{children}</p>,
  Tag: ({
    name,
    count,
    onClick,
    'data-testid': testId,
  }: {
    name: string;
    count?: number;
    onClick?: (name: string) => void;
    'data-testid'?: string;
  }) => (
    <button data-testid={testId} onClick={() => onClick?.(name)}>
      {name}
      {count && <span>{count}</span>}
    </button>
  ),
}));

describe('HotTags', () => {
  beforeEach(() => {
    mockPush.mockClear();
    mockUseHotTags.mockReturnValue({
      tags: mockTags,
      isLoading: false,
    });
  });

  it('renders the component with title', () => {
    render(<HotTags />);
    expect(screen.getByText('Hot tags')).toBeInTheDocument();
  });

  it('renders up to 5 tags by default', () => {
    render(<HotTags />);

    expect(screen.getByText('bitcoin')).toBeInTheDocument();
    expect(screen.getByText('keys')).toBeInTheDocument();
    expect(screen.getByText('pubky')).toBeInTheDocument();
    expect(screen.getByText('autonomy')).toBeInTheDocument();
    expect(screen.getByText('satoshi')).toBeInTheDocument();
    expect(screen.queryByText('ethereum')).not.toBeInTheDocument();
  });

  it('shows "Explore all" button', () => {
    render(<HotTags />);

    expect(screen.getByTestId('see-all-button')).toBeInTheDocument();
    expect(screen.getByText('Explore all')).toBeInTheDocument();
  });

  it('navigates to search with tag when tag is clicked', () => {
    render(<HotTags />);

    const tag = screen.getByTestId('tag-0');
    fireEvent.click(tag);

    expect(mockPush).toHaveBeenCalledWith('/search?tags=bitcoin');
  });

  it('navigates to /hot when "Explore all" is clicked', () => {
    render(<HotTags />);

    const seeAllButton = screen.getByTestId('see-all-button');
    fireEvent.click(seeAllButton);

    expect(mockPush).toHaveBeenCalledWith('/hot');
  });

  it('renders tags with counts', () => {
    render(<HotTags />);

    expect(screen.getByText('16')).toBeInTheDocument();
    expect(screen.getByText('176')).toBeInTheDocument();
    expect(screen.getByText('149')).toBeInTheDocument();
  });

  it('renders tags with correct data-testid', () => {
    render(<HotTags />);

    expect(screen.getByTestId('tag-0')).toBeInTheDocument();
    expect(screen.getByTestId('tag-1')).toBeInTheDocument();
    expect(screen.getByTestId('tag-2')).toBeInTheDocument();
  });

  it('renders skeleton list while loading', () => {
    mockUseHotTags.mockReturnValue({
      tags: [],
      isLoading: true,
    });

    render(<HotTags />);

    expect(screen.getAllByTestId('hot-tag-skeleton')).toHaveLength(5);
    expect(screen.queryByTestId('tag-0')).not.toBeInTheDocument();
  });
});
