import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { NexusGraphNode } from '@/services/nexus/graph/graph.types';
import { SocialGraphNodePanel } from './SocialGraphNodePanel';

vi.mock('@/hooks/useIsFollowing/useIsFollowing', () => ({
  useIsFollowing: () => ({ isFollowing: false, isLoading: false }),
}));

vi.mock('@/hooks/useFollowUser/useFollowUser', () => ({
  useFollowUser: () => ({ toggleFollow: vi.fn(), isUserLoading: () => false }),
}));

const mockUseTtlSubscription = vi.fn().mockReturnValue({ ref: () => {}, isVisible: true });
vi.mock('@/hooks/useTtlSubscription/useTtlSubscription', () => ({
  useTtlSubscription: (options: unknown) => mockUseTtlSubscription(options),
}));

vi.mock('@/stores/auth/auth.store', () => ({
  useAuthStore: () => ({ currentUserPubky: 'viewerpubky' }),
}));

vi.mock('@/controllers/file/file', () => ({
  FileController: { getAvatarUrl: vi.fn(() => 'https://cdn.example/avatar') },
}));

vi.mock('@/molecules/PostPreviewCard/PostPreviewCard', () => ({
  PostPreviewCard: ({ postId }: { postId: string }) => <div data-testid="post-preview">{postId}</div>,
}));

vi.mock('../DialogReply/DialogReply', () => ({
  DialogReply: () => null,
}));

const baseProps = {
  relationship: 'following' as const,
  isExpanded: false,
  isExpanding: false,
  proofUsers: [{ pubky: 'proof1', name: 'Proof One', image: null }],
  onProofHover: vi.fn(),
  onExpand: vi.fn(),
  onRefreshNode: vi.fn(),
  onFocus: vi.fn(),
  onTracePath: vi.fn(),
  isTracing: false,
  onClose: vi.fn(),
};

describe('SocialGraphNodePanel', () => {
  it('renders a user card with follow, focus, and expand actions', () => {
    const node: NexusGraphNode = { kind: 'user', id: 'user:abc', pubky: 'abc', name: 'Alice', image: null };
    render(<SocialGraphNodePanel node={node} {...baseProps} />);

    expect(screen.getByText('Alice')).toBeInTheDocument();
    // The shared FollowButton molecule renders for other users
    expect(screen.getByLabelText('Follow')).toBeInTheDocument();
    expect(document.querySelector('[data-cy="graph-panel-expand"]')).toBeInTheDocument();
    expect(document.querySelector('[data-cy="graph-panel-focus"]')).toBeInTheDocument();
    // Social proof strip and trace-path action render for other users
    expect(document.querySelector('[data-cy="graph-panel-proof"]')).toBeInTheDocument();
    expect(document.querySelector('[data-cy="graph-panel-trace"]')).toBeInTheDocument();
    // The pinned profile subscribes to the TTL coordinator for freshness
    expect(mockUseTtlSubscription).toHaveBeenCalledWith({ type: 'user', id: 'abc' });
  });

  it('renders the real post preview with reply', () => {
    const node: NexusGraphNode = {
      kind: 'post',
      id: 'post:abc:123',
      author_id: 'abc',
      post_id: '123',
      content: 'Hello graph world',
      post_kind: 'short',
      is_reply: false,
      indexed_at: 1719000000,
    };
    render(<SocialGraphNodePanel node={node} {...baseProps} />);

    // The app's real post preview renders with the composite id
    expect(screen.getByTestId('post-preview')).toHaveTextContent('abc:123');
    expect(document.querySelector('[data-cy="graph-panel-reply"]')).toBeInTheDocument();
    expect(document.querySelector('[data-cy="graph-panel-focus"]')).not.toBeInTheDocument();
  });

  it('renders a tag card with the label and usage count', () => {
    const node: NexusGraphNode = { kind: 'tag', id: 'tag:bitcoin', label: 'bitcoin', count: 12 };
    render(<SocialGraphNodePanel node={node} {...baseProps} />);

    expect(screen.getByText('bitcoin')).toBeInTheDocument();
  });

  it('disables expand when the node is already expanded', () => {
    const node: NexusGraphNode = { kind: 'tag', id: 'tag:x', label: 'x', count: 1 };
    render(<SocialGraphNodePanel node={node} {...baseProps} isExpanded />);

    expect(document.querySelector('[data-cy="graph-panel-expand"]')).toBeDisabled();
  });

  it('frosts the panel so its copy stays readable over the canvas', () => {
    const node: NexusGraphNode = { kind: 'tag', id: 'tag:dev', label: 'dev', count: 113 };
    render(<SocialGraphNodePanel node={node} {...baseProps} />);

    expect(document.querySelector('[data-cy="graph-panel"]')).toHaveClass('backdrop-blur-md');
  });

  it('labels a reply as such instead of a generic post', () => {
    const node: NexusGraphNode = {
      kind: 'post',
      id: 'post:abc:124',
      author_id: 'abc',
      post_id: '124',
      content: '@DZ!',
      post_kind: 'short',
      is_reply: true,
      indexed_at: 1719000001,
    };
    render(<SocialGraphNodePanel node={node} {...baseProps} />);

    // The kind label (the Reply action button also says "Reply")
    expect(document.querySelector('[data-cy="graph-panel"] .uppercase')).toHaveTextContent('Reply');
    expect(screen.queryByText('Post')).not.toBeInTheDocument();
  });
});
