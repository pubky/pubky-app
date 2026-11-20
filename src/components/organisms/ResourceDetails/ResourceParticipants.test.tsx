import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ResourceParticipants } from './ResourceParticipants';

const mocks = vi.hoisted(() => ({
  result: { participants: [] as { id: string; name?: string }[], isLoading: false },
  args: [] as unknown[],
}));

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock('@/hooks/useFollowUser/useFollowUser', () => ({
  useFollowUser: () => ({ toggleFollow: vi.fn(), isUserLoading: () => false }),
}));
vi.mock('@/hooks/useResourceParticipants/useResourceParticipants', () => ({
  useResourceParticipants: (...args: unknown[]) => {
    mocks.args = args;
    return mocks.result;
  },
}));
vi.mock('@/organisms/SinglePostParticipants/SinglePostParticipants', () => ({
  ParticipantItem: ({ participant }: { participant: { id: string } }) => (
    <div data-testid="participant-item">{participant.id}</div>
  ),
}));
vi.mock('@/organisms/SinglePostParticipants/SinglePostParticipants.skeleton', () => ({
  SinglePostParticipantsSkeleton: () => <div data-testid="participants-skeleton" />,
}));

const URI = 'https://www.openstreetmap.org/node/240109189';

describe('ResourceParticipants', () => {
  beforeEach(() => {
    mocks.result = { participants: [], isLoading: false };
  });

  it('lists the people in the post page’s Participants section and rows', () => {
    mocks.result = { participants: [{ id: 'replier' }, { id: 'tagger' }], isLoading: false };
    render(<ResourceParticipants uri={URI} replyIds={['replier:1']} />);

    expect(screen.getByText('Participants')).toBeInTheDocument();
    expect(screen.getAllByTestId('participant-item').map((row) => row.textContent)).toEqual(['replier', 'tagger']);
    expect(mocks.args).toEqual([URI, ['replier:1'], { spellings: undefined }]);
  });

  it('shows the skeleton while read and nothing when nobody took part', () => {
    mocks.result = { participants: [], isLoading: true };
    const { rerender, container } = render(<ResourceParticipants uri={URI} replyIds={[]} />);
    expect(screen.getByTestId('participants-skeleton')).toBeInTheDocument();

    mocks.result = { participants: [], isLoading: false };
    rerender(<ResourceParticipants uri={URI} replyIds={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});
