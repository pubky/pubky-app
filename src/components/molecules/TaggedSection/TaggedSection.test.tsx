import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { TaggedSection } from './TaggedSection';
import type { TaggedSectionProps } from './TaggedSection.types';

// Mock TagInput and TaggedList
vi.mock('@/molecules/TaggedList/TaggedList', () => {
  return {
    TaggedList: ({ tags }: { tags: unknown[] }) => <div data-testid="tagged-list">{tags.length} tags</div>,
  };
});

vi.mock('@/molecules/TagInput/TagInput', () => {
  return {
    TagInput: () => <div data-testid="tag-input">TagInput</div>,
  };
});

const defaultProps: TaggedSectionProps = {
  tags: [
    {
      label: 'bitcoin',
      taggers: [{ id: 'user1', avatarUrl: 'https://cdn.example.com/avatar/user1' }],
      taggers_count: 1,
      relationship: false,
    },
  ],
  userName: 'Satoshi',
  handleTagAdd: vi.fn().mockResolvedValue({ success: true }),
  handleTagToggle: vi.fn(),
  hasMore: false,
  isLoadingMore: false,
  loadMore: vi.fn(),
};

describe('TaggedSection', () => {
  it('renders user name in header', () => {
    render(<TaggedSection {...defaultProps} />);
    expect(screen.getByText('Satoshi was tagged as:')).toBeInTheDocument();
  });

  it('renders TagInput', () => {
    render(<TaggedSection {...defaultProps} />);
    expect(screen.getByTestId('tag-input')).toBeInTheDocument();
  });

  it('renders TaggedList', () => {
    render(<TaggedSection {...defaultProps} />);
    expect(screen.getByTestId('tagged-list')).toBeInTheDocument();
  });
});

describe('TaggedSection - Snapshots', () => {
  it('matches snapshot', () => {
    const { container } = render(<TaggedSection {...defaultProps} />);
    expect(container.firstChild).toMatchSnapshot();
  });
});
