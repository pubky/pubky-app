import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { TagWithAvatars } from '@/molecules/TaggedItem/TaggedItem.types';
import { ProfilePageTaggedAs } from './ProfilePageTaggedAs';

// Mock next/navigation
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
  }),
}));

// Mock TaggedItem. The avatar marker only renders when `hideAvatars` is falsy,
// so the sidebar snapshots (which always hide avatars) stay unchanged.
vi.mock('@/molecules/TaggedItem/TaggedItem', () => {
  return {
    TaggedItem: ({ tag, hideAvatars }: { tag: TagWithAvatars; hideAvatars?: boolean }) => (
      <div data-testid="tagged-item">
        {tag.label}
        {!hideAvatars && <span data-testid="tagged-item-avatars" />}
      </div>
    ),
  };
});

const defaultTags: TagWithAvatars[] = [
  {
    label: 'bitcoin',
    taggers: [{ id: 'user1', avatarUrl: 'https://cdn.example.com/avatar/user1' }],
    taggers_count: 5,
    relationship: false,
  },
  {
    label: 'nostr',
    taggers: [{ id: 'user2', avatarUrl: 'https://cdn.example.com/avatar/user2' }],
    taggers_count: 3,
    relationship: false,
  },
  {
    label: 'web3',
    taggers: [{ id: 'user3', avatarUrl: 'https://cdn.example.com/avatar/user3' }],
    taggers_count: 2,
    relationship: false,
  },
];

const mockOnTagClick = vi.fn();

describe('ProfilePageTaggedAs', () => {
  it('renders heading correctly', () => {
    render(<ProfilePageTaggedAs tags={defaultTags} onTagClick={mockOnTagClick} />);
    expect(screen.getByText('Tagged as')).toBeInTheDocument();
  });

  it('renders all tags using TaggedItem', () => {
    render(<ProfilePageTaggedAs tags={defaultTags} onTagClick={mockOnTagClick} />);
    const taggedItems = screen.getAllByTestId('tagged-item');
    expect(taggedItems).toHaveLength(defaultTags.length);
  });

  it('renders Add Tag button', () => {
    render(<ProfilePageTaggedAs tags={defaultTags} onTagClick={mockOnTagClick} />);
    const addTagButton = screen.getByText(/Add Tag/);
    expect(addTagButton).toBeInTheDocument();
  });

  it('renders Add Tag button when viewing other profile', () => {
    render(<ProfilePageTaggedAs tags={defaultTags} onTagClick={mockOnTagClick} pubky="pk:abc123" />);
    const addTagButton = screen.getByText(/Add Tag/);
    expect(addTagButton).toBeInTheDocument();
  });

  it('Add Tag button has correct styling', () => {
    render(<ProfilePageTaggedAs tags={defaultTags} onTagClick={mockOnTagClick} />);
    const addTagButton = screen.getByText(/Add Tag/).closest('button');
    expect(addTagButton).toHaveClass('border', 'border-border', 'bg-foreground/5');
  });

  it('has correct container structure', () => {
    const { container } = render(<ProfilePageTaggedAs tags={defaultTags} onTagClick={mockOnTagClick} />);
    const rootElement = container.firstChild as HTMLElement;
    expect(rootElement).toHaveClass('flex', 'flex-col', 'gap-2');
  });

  it('renders no tags message when tags array is empty', () => {
    render(<ProfilePageTaggedAs tags={[]} onTagClick={mockOnTagClick} />);
    expect(screen.getByText('No tags added yet.')).toBeInTheDocument();
  });

  it('does not render no tags message when tags exist', () => {
    render(<ProfilePageTaggedAs tags={defaultTags} onTagClick={mockOnTagClick} />);
    expect(screen.queryByText('No tags added yet.')).not.toBeInTheDocument();
  });

  it('renders skeleton when isLoading', () => {
    render(<ProfilePageTaggedAs tags={[]} onTagClick={mockOnTagClick} isLoading />);
    expect(screen.getByTestId('profile-tagged-skeleton')).toBeInTheDocument();
  });
});

describe('ProfilePageTaggedAs - mobile variant', () => {
  const mockOnTagAdd = vi.fn().mockResolvedValue({ success: true });
  const mobileProps = {
    tags: defaultTags,
    onTagClick: mockOnTagClick,
    variant: 'mobile' as const,
    count: 7,
    onTagAdd: mockOnTagAdd,
  };

  it('renders the total tag count in the heading', () => {
    render(<ProfilePageTaggedAs {...mobileProps} />);
    expect(screen.getByText('Tagged (7)')).toBeInTheDocument();
    expect(screen.queryByText('Tagged as')).not.toBeInTheDocument();
  });

  it('renders the total count, not the number of preview rows', () => {
    render(<ProfilePageTaggedAs {...mobileProps} />);
    expect(screen.getAllByTestId('tagged-item')).toHaveLength(defaultTags.length);
    expect(screen.getByText('Tagged (7)')).toBeInTheDocument();
  });

  it('renders the inline add tag input', () => {
    render(<ProfilePageTaggedAs {...mobileProps} />);
    expect(screen.getByPlaceholderText('add tag')).toBeInTheDocument();
  });

  it('adds a tag typed into the input', async () => {
    render(<ProfilePageTaggedAs {...mobileProps} />);
    const input = screen.getByPlaceholderText('add tag');
    fireEvent.change(input, { target: { value: 'cypherpunk' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    await waitFor(() => expect(mockOnTagAdd).toHaveBeenCalledWith('cypherpunk'));
  });

  it('renders tagger avatars for every preview row', () => {
    render(<ProfilePageTaggedAs {...mobileProps} />);
    expect(screen.getAllByTestId('tagged-item-avatars')).toHaveLength(defaultTags.length);
  });

  it('replaces the Add Tag button with See All', () => {
    render(<ProfilePageTaggedAs {...mobileProps} />);
    expect(screen.getByText('See All')).toBeInTheDocument();
    expect(screen.queryByText('Add Tag')).not.toBeInTheDocument();
  });

  it('keeps the sidebar variant free of the input and avatars', () => {
    render(<ProfilePageTaggedAs tags={defaultTags} onTagClick={mockOnTagClick} count={7} onTagAdd={mockOnTagAdd} />);
    expect(screen.getByText('Tagged as')).toBeInTheDocument();
    expect(screen.getByText('Add Tag')).toBeInTheDocument();
    expect(screen.queryByPlaceholderText('add tag')).not.toBeInTheDocument();
    expect(screen.queryByTestId('tagged-item-avatars')).not.toBeInTheDocument();
  });
});

describe('ProfilePageTaggedAs - Snapshots', () => {
  it('matches snapshot with tags', () => {
    const { container } = render(<ProfilePageTaggedAs tags={defaultTags} onTagClick={mockOnTagClick} />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with empty tags', () => {
    const { container } = render(<ProfilePageTaggedAs tags={[]} onTagClick={mockOnTagClick} />);
    expect(container.firstChild).toMatchSnapshot();
  });
});
