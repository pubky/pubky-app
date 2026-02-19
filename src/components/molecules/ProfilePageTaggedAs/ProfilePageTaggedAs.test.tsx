import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ProfilePageTaggedAs } from './ProfilePageTaggedAs';
import type { TagWithAvatars } from '@/molecules/TaggedItem/TaggedItem.types';

// Mock next/navigation
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
  }),
}));

// Mock TaggedItem
vi.mock('@/molecules', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/molecules')>();
  return {
    ...actual,
    TaggedItem: ({ tag }: { tag: TagWithAvatars }) => <div data-testid="tagged-item">{tag.label}</div>,
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
