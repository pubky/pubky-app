import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useModerationDecisions } from '@/hooks/useModerationDecisions/useModerationDecisions';
import { moderationDecisionSchema } from '@/services/moderation-decision/moderation-decision.types';
import wire from '@/services/moderation-decision/moderation-decision.wire.fixture.json';
import { ModerationDecisionNotices } from './ModerationDecisionNotices';

vi.mock('@/hooks/useModerationDecisions/useModerationDecisions', () => ({ useModerationDecisions: vi.fn() }));

describe('ModerationDecisionNotices', () => {
  beforeEach(() => {
    vi.mocked(useModerationDecisions).mockReturnValue([]);
  });

  it('renders nothing for a user with no statements', () => {
    const { container } = render(<ModerationDecisionNotices />);

    expect(container).toBeEmptyDOMElement();
  });

  it('renders one card per statement in order, including one that could not be read', () => {
    vi.mocked(useModerationDecisions).mockReturnValue([
      moderationDecisionSchema.parse(wire.content_removed),
      null,
      moderationDecisionSchema.parse(wire.account_disabled),
    ]);

    render(<ModerationDecisionNotices />);

    const cards = screen.getAllByTestId('moderation-decision-card');
    expect(cards).toHaveLength(3);
    expect(cards[0]).toHaveTextContent('We deleted the record of your content');
    expect(cards[1]).toHaveTextContent('cannot show');
    expect(cards[2]).toHaveTextContent('We disabled your account');
  });
});
