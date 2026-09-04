import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TagKind } from '@/application/tag/tag.types';
import type { TaggedListProps } from '@/molecules/TaggedList/TaggedList.types';
import { TaggedSection } from './TaggedSection';
import type { TaggedSectionProps } from './TaggedSection.types';

const { mockTaggedList } = vi.hoisted(() => ({
  mockTaggedList: vi.fn(),
}));

// Mock TagInput and TaggedList
vi.mock('@/molecules/TaggedList/TaggedList', () => {
  return {
    TaggedList: (props: TaggedListProps) => {
      mockTaggedList(props);
      return <div data-testid="tagged-list">{props.tags.length} tags</div>;
    },
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
  taggedId: 'profile-pubky',
  taggedKind: TagKind.USER,
  userName: 'Satoshi',
  handleTagAdd: vi.fn().mockResolvedValue({ success: true }),
  handleTagToggle: vi.fn(),
  hasMore: false,
  isLoadingMore: false,
  loadMore: vi.fn(),
};

describe('TaggedSection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

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

  it('forwards the tagged entity context to TaggedList', () => {
    render(<TaggedSection {...defaultProps} />);

    expect(mockTaggedList).toHaveBeenCalledWith(
      expect.objectContaining({
        taggedId: 'profile-pubky',
        taggedKind: TagKind.USER,
      }),
    );
  });
});

describe('TaggedSection - Snapshots', () => {
  it('matches snapshot', () => {
    const { container } = render(<TaggedSection {...defaultProps} />);
    expect(container.firstChild).toMatchSnapshot();
  });
});
