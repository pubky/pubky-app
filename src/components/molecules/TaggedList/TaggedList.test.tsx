import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TaggedList } from './TaggedList';
import type { TagWithAvatars } from '@/molecules/TaggedItem/TaggedItem.types';

// Mock TaggedItem
vi.mock('@/molecules/TaggedItem/TaggedItem', () => {
  return {
    TaggedItem: ({ tag }: { tag: TagWithAvatars }) => <div data-testid="tagged-item">{tag.label}</div>,
  };
});

const mockTags: TagWithAvatars[] = [
  {
    label: 'bitcoin',
    taggers: [
      { id: 'user1', avatarUrl: 'https://cdn.example.com/avatar/user1' },
      { id: 'user2', avatarUrl: 'https://cdn.example.com/avatar/user2' },
    ],
    taggers_count: 2,
    relationship: false,
  },
  {
    label: 'satoshi',
    taggers: [{ id: 'user3', avatarUrl: 'https://cdn.example.com/avatar/user3' }],
    taggers_count: 1,
    relationship: false,
  },
];

const mockOnTagToggle = vi.fn();

describe('TaggedList', () => {
  it('renders all tags', () => {
    render(<TaggedList tags={mockTags} onTagToggle={mockOnTagToggle} />);

    expect(screen.getByText('bitcoin')).toBeInTheDocument();
    expect(screen.getByText('satoshi')).toBeInTheDocument();
  });

  it('renders empty list when no tags', () => {
    const { container } = render(<TaggedList tags={[]} onTagToggle={mockOnTagToggle} />);
    expect(container.firstChild).toBeInTheDocument();
    expect(screen.queryByTestId('tagged-item')).not.toBeInTheDocument();
  });

  it('renders correct number of items', () => {
    render(<TaggedList tags={mockTags} onTagToggle={mockOnTagToggle} />);
    const items = screen.getAllByTestId('tagged-item');
    expect(items).toHaveLength(2);
  });
});

describe('TaggedList - Snapshots', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockOnTagToggle.mockClear();
  });

  it('matches snapshot with tags', () => {
    const { container } = render(<TaggedList tags={mockTags} onTagToggle={mockOnTagToggle} />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with empty tags', () => {
    const { container } = render(<TaggedList tags={[]} onTagToggle={mockOnTagToggle} />);
    expect(container.firstChild).toMatchSnapshot();
  });
});
