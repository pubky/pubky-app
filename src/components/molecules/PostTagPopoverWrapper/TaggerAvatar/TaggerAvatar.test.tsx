import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { TaggerAvatar } from './TaggerAvatar';
import type { TaggerWithAvatar } from '@/molecules/TaggedItem/TaggedItem.types';

vi.mock('@/organisms/AvatarWithFallback/AvatarWithFallback', () => {
  return {
    AvatarWithFallback: ({ name }: { name: string }) => <div data-testid={`avatar-${name}`}>Avatar</div>,
  };
});

vi.mock('../../UserInfoPopover/UserInfoPopover', () => ({
  UserInfoPopover: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="user-info-popover">{children}</div>
  ),
}));

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

  it('wraps trigger in UserInfoPopover', () => {
    render(<TaggerAvatar tagger={mockTagger} index={0} />);
    expect(screen.getByTestId('user-info-popover')).toBeInTheDocument();
  });
});

describe('TaggerAvatar - Snapshots', () => {
  it('matches snapshot (index 0)', () => {
    const { container } = render(<TaggerAvatar tagger={mockTagger} index={0} />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot (index 1)', () => {
    const { container } = render(<TaggerAvatar tagger={mockTagger} index={1} />);
    expect(container.firstChild).toMatchSnapshot();
  });
});
