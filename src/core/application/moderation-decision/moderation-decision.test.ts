import { describe, expect, it, vi } from 'vitest';
import { ModerationDecisionService } from '@/services/moderation-decision/moderation-decision';
import { ModerationDecisionApplication } from './moderation-decision';

vi.mock('@/services/moderation-decision/moderation-decision', () => ({
  ModerationDecisionService: { fetchDecisions: vi.fn() },
}));

describe('ModerationDecisionApplication.fetchDecisions', () => {
  it('returns what the service read', async () => {
    vi.mocked(ModerationDecisionService.fetchDecisions).mockResolvedValue({ status: 'ready', decisions: [] });

    await expect(ModerationDecisionApplication.fetchDecisions()).resolves.toEqual({ status: 'ready', decisions: [] });
  });

  it('returns an unavailable service as a value', async () => {
    vi.mocked(ModerationDecisionService.fetchDecisions).mockResolvedValue({ status: 'unavailable' });

    await expect(ModerationDecisionApplication.fetchDecisions()).resolves.toEqual({ status: 'unavailable' });
  });
});
