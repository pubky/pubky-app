import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { UserController } from '@/controllers/user/user';
import type { Pubky } from '@/models/models.types';
import type { NexusGraphUserNode } from '@/services/nexus/graph/graph.types';
import { GraphUserHoverCard } from './GraphUserHoverCard';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => '/graph',
}));

vi.mock('@/controllers/user/user', () => ({
  UserController: {
    getManyDetails: vi.fn(),
    getManyCounts: vi.fn(),
    getManyRelationships: vi.fn(),
    getManyTagsOrFetch: vi.fn(),
  },
}));

vi.mock('@/controllers/file/file', () => ({
  FileController: { getAvatarUrl: vi.fn(() => 'https://cdn.example/avatar') },
}));

vi.mock('@/hooks/useUserInfoPopoverActions/useUserInfoPopoverActions', () => ({
  useUserInfoPopoverActions: vi.fn(() => ({ isLoading: false, onEditClick: vi.fn(), onFollowClick: vi.fn() })),
}));

const mockDetails = vi.mocked(UserController.getManyDetails);
const mockCounts = vi.mocked(UserController.getManyCounts);
const mockRels = vi.mocked(UserController.getManyRelationships);

const PK = 'p'.repeat(52) as Pubky;
const ME = 'm'.repeat(52) as Pubky;
const node: NexusGraphUserNode = { kind: 'user', id: `user:${PK}`, pubky: PK, name: 'Jane', image: null };

const baseProps = {
  node,
  open: true,
  x: 100,
  y: 100,
  nodes: [node],
  edges: [],
  meId: `user:${ME}`,
};

describe('GraphUserHoverCard', () => {
  beforeEach(() => {
    mockDetails.mockResolvedValue(new Map([[PK, { name: 'Jane Stuart', bio: 'Vibing', image: null }]]) as never);
    mockCounts.mockResolvedValue(new Map([[PK, { followers: 15, following: 19 }]]) as never);
    mockRels.mockResolvedValue(new Map([[PK, { following: false, followed_by: false }]]) as never);
  });

  it('renders identity instantly and local data when it lands, with both action buttons', async () => {
    const onTraceConnection = vi.fn();
    render(<GraphUserHoverCard {...baseProps} onTraceConnection={onTraceConnection} />);

    // Identity from the node payload, before any read resolves
    expect(screen.getByText('Jane')).toBeInTheDocument();

    await waitFor(() => expect(screen.getByText('Vibing')).toBeInTheDocument());
    expect(screen.getByText('15')).toBeInTheDocument();
    expect(screen.getByText('19')).toBeInTheDocument();

    const trace = document.querySelector('[data-cy="graph-hover-trace"]')!;
    expect(trace).toBeInTheDocument();
    trace.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(onTraceConnection).toHaveBeenCalledWith(PK);

    // Zero-network contract: only the local-only bulk getters ran
    expect(UserController.getManyTagsOrFetch).not.toHaveBeenCalled();
  });

  it('hides follow and how-connected for the viewer, and how-connected when signed out', async () => {
    render(<GraphUserHoverCard {...baseProps} node={{ ...node }} meId={node.id} onTraceConnection={vi.fn()} />);
    await waitFor(() => expect(mockDetails).toHaveBeenCalled());
    expect(document.querySelector('[data-cy="graph-hover-trace"]')).toBeNull();

    render(<GraphUserHoverCard {...baseProps} meId={null} onTraceConnection={vi.fn()} />);
    await waitFor(() => expect(mockDetails).toHaveBeenCalled());
    expect(document.querySelector('[data-cy="graph-hover-trace"]')).toBeNull();
  });

  it('renders nothing when closed', () => {
    const { container } = render(<GraphUserHoverCard {...baseProps} open={false} />);
    expect(container.firstChild).toBeNull();
  });
});
