import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { TaggerAvatar } from './TaggerAvatar';
import type { TaggerWithAvatar } from '@/molecules/TaggedItem/TaggedItem.types';

vi.mock('@/organisms', () => ({
  AvatarWithFallback: ({ name }: { name: string }) => <div data-testid={`avatar-${name}`}>Avatar</div>,
}));

vi.mock('../../PostHeaderUserInfoPopoverWrapper', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../PostHeaderUserInfoPopoverWrapper')>();
  return {
    ...actual,
    PostHeaderUserInfoPopoverContent: () => <div data-testid="user-info-content">User Info</div>,
  };
});

vi.mock('@/libs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/libs')>();
  return { ...actual, formatPublicKey: () => 'formatted-key' };
});

const mockTagger: TaggerWithAvatar = {
  id: 'user1',
  avatarUrl: 'https://example.com/1.png',
  name: 'Alice',
};

describe('TaggerAvatar', () => {
  it('renders avatar with tagger name', () => {
    render(<TaggerAvatar tagger={mockTagger} index={0} />);
    expect(screen.getByTestId('avatar-Alice')).toBeInTheDocument();
  });

  it('renders trigger with popover role', () => {
    render(<TaggerAvatar tagger={mockTagger} index={0} />);
    const trigger = screen.getByRole('button');
    expect(trigger).toBeInTheDocument();
    expect(trigger).toHaveAttribute('aria-haspopup', 'dialog');
  });

  it('shows user info content when trigger is clicked', () => {
    render(<TaggerAvatar tagger={mockTagger} index={0} />);
    expect(screen.queryByTestId('user-info-content')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button'));
    expect(screen.getByTestId('user-info-content')).toBeInTheDocument();
  });
});

describe('TaggerAvatar - Snapshots', () => {
  it('matches snapshot (closed state, index 0)', () => {
    const { container } = render(<TaggerAvatar tagger={mockTagger} index={0} />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot (closed state, index 1)', () => {
    const { container } = render(<TaggerAvatar tagger={mockTagger} index={1} />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot (open state)', () => {
    const { container } = render(<TaggerAvatar tagger={mockTagger} index={0} />);
    fireEvent.click(screen.getByRole('button'));
    expect(container.firstChild).toMatchSnapshot();
  });
});
