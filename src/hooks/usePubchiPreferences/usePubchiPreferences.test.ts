import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PubchiController } from '@/controllers/pubchi/pubchi';
import type { PubchiConfigV1 } from '@/libs/pubchi/schemas/config';
import { toast } from '@/molecules/Toaster/toast';
import { useAuthStore } from '@/stores/auth/auth.store';
import { authInitialState } from '@/stores/auth/auth.types';
import { usePubchiPreferences } from './usePubchiPreferences';

const OWNER = 'a'.repeat(52);
const config: PubchiConfigV1 = {
  schema: 'pubchi-config',
  version: 1,
  owner: OWNER,
  bot: 'b'.repeat(52),
  updated_at: 1,
  display_name: 'Scout',
  tier: 'assisted',
  language: 'en',
  summary: { length: 'short', include_sources: true, include_disagreement: true },
  interests: { topics: [], excluded_topics: [] },
  proactive: { enabled: false, max_suggestions_per_day: 1, quiet_hours_utc: { start: 22, end: 7 } },
  follower_history_opt_in: false,
  brain: {
    adapter: 'vercel-ai',
    execution: 'synonym-hosted',
    provider_id: 'moonshot',
    model_id: 'kimi-k3',
    endpoint: null,
    send_public_graph_context: true,
    send_public_web_context: false,
  },
};
vi.mock('@/controllers/pubchi/pubchi', () => ({
  PubchiController: { loadPubchiConfig: vi.fn(), loadPubchi: vi.fn(), savePubchiConfig: vi.fn() },
}));
vi.mock('@/molecules/Toaster/toast', () => ({ toast: vi.fn() }));

describe('usePubchiPreferences ownership', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthStore.setState({ ...authInitialState, currentUserPubky: OWNER, generation: 'first' });
    vi.mocked(PubchiController.loadPubchiConfig).mockResolvedValue(config);
    vi.mocked(PubchiController.loadPubchi).mockResolvedValue(undefined);
  });

  it('accepts a save for the current account and generation', async () => {
    vi.mocked(PubchiController.savePubchiConfig).mockResolvedValue(config);
    const onSaved = vi.fn();
    const { result } = renderHook(() => usePubchiPreferences(onSaved));
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => {
      await expect(result.current.submit()).resolves.toBe(true);
    });
    expect(onSaved).toHaveBeenCalledWith(config);
    expect(result.current.saved).toBe(true);
  });

  it.each(['owner', 'generation', 'unmount', 'response owner'] as const)(
    'discards an obsolete save after %s changes',
    async (change) => {
      let resolveSave!: (value: PubchiConfigV1) => void;
      vi.mocked(PubchiController.savePubchiConfig).mockImplementation(
        () =>
          new Promise((resolve) => {
            resolveSave = resolve;
          }),
      );
      const onSaved = vi.fn();
      const { result, unmount } = renderHook(() => usePubchiPreferences(onSaved));
      await waitFor(() => expect(result.current.loading).toBe(false));
      let saving!: Promise<boolean>;
      act(() => {
        saving = result.current.submit();
      });
      await waitFor(() => expect(PubchiController.savePubchiConfig).toHaveBeenCalledOnce());
      if (change === 'unmount') unmount();
      else if (change === 'owner')
        act(() => useAuthStore.setState({ currentUserPubky: 'c'.repeat(52), generation: 'second' }));
      else if (change === 'generation') act(() => useAuthStore.setState({ generation: 'second' }));
      await act(async () => {
        resolveSave(change === 'response owner' ? { ...config, owner: 'c'.repeat(52) } : config);
        await expect(saving).resolves.toBe(false);
      });
      expect(onSaved).not.toHaveBeenCalled();
      expect(toast).not.toHaveBeenCalledWith(expect.objectContaining({ title: 'Preferences saved' }));
    },
  );
});
