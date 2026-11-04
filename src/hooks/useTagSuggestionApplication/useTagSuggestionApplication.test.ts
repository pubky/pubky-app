import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PubchiController } from '@/controllers/pubchi/pubchi';
import { isPubchiEnabled } from '@/libs/pubchi/flags';
import { useTagSuggestionApplication } from './useTagSuggestionApplication';

vi.mock('@/controllers/pubchi/pubchi', () => ({
  PubchiController: {
    getTagSuggestionStatuses: vi.fn(),
    reconcileTagSuggestion: vi.fn(),
  },
}));

vi.mock('@/libs/pubchi/flags', () => ({
  isPubchiEnabled: vi.fn(),
}));

describe('useTagSuggestionApplication', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(isPubchiEnabled).mockReturnValue(true);
    vi.mocked(PubchiController.getTagSuggestionStatuses).mockResolvedValue({ 0: 'applying' });
    vi.mocked(PubchiController.reconcileTagSuggestion).mockResolvedValue('applied');
  });

  it('reconciles an applying record once when visibility changes from hidden to visible', async () => {
    const { rerender } = renderHook(({ visible }) => useTagSuggestionApplication('record-1', visible), {
      initialProps: { visible: false },
    });

    expect(PubchiController.reconcileTagSuggestion).not.toHaveBeenCalled();

    rerender({ visible: true });

    await waitFor(() => {
      expect(PubchiController.reconcileTagSuggestion).toHaveBeenCalledOnce();
    });
    expect(PubchiController.reconcileTagSuggestion).toHaveBeenCalledWith('record-1', 0);
  });
});
