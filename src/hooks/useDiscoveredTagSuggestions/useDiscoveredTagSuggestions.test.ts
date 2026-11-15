import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DiscoveredTagSuggestion } from '@/application/pubchi/pubchi.types';
import { PubchiController } from '@/controllers/pubchi/pubchi';
import { toast } from '@/molecules/Toaster/toast';
import { useDiscoveredTagSuggestions } from './useDiscoveredTagSuggestions';

vi.mock('@/libs/pubchi/flags', () => ({ isPubchiEnabled: () => true }));
vi.mock('@/molecules/Toaster/toast', () => ({ toast: vi.fn() }));

vi.mock('@/controllers/pubchi/pubchi', () => ({
  PubchiController: {
    discoverTagSuggestions: vi.fn(),
    reconcileDiscoveredTagSuggestion: vi.fn(),
    revertDiscoveredTagSuggestion: vi.fn(),
  },
}));

const first: DiscoveredTagSuggestion = {
  applicationId: 'a'.repeat(64),
  owner: 'owner-1',
  target: { kind: 'post', uri: 'pubky://author/pub/pubky.app/posts/one' },
  label: 'builder',
  status: 'applying',
  alreadyExisted: null,
};

describe('useDiscoveredTagSuggestions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(PubchiController.discoverTagSuggestions).mockResolvedValue([first]);
  });

  it('discards a late old-target result and keeps the new target result', async () => {
    let resolveOld!: (value: DiscoveredTagSuggestion[]) => void;
    vi.mocked(PubchiController.discoverTagSuggestions)
      .mockImplementationOnce(() => new Promise((resolve) => (resolveOld = resolve)))
      .mockResolvedValueOnce([
        { ...first, target: { ...first.target, uri: 'pubky://author/pub/pubky.app/posts/two' } },
      ]);
    const { result, rerender } = renderHook(
      ({ targetUri }) => useDiscoveredTagSuggestions('owner-1', targetUri, true),
      { initialProps: { targetUri: first.target.uri } },
    );

    rerender({ targetUri: 'pubky://author/pub/pubky.app/posts/two' });
    await waitFor(() => expect(result.current.suggestions[0]?.target.uri).toContain('/two'));
    await act(async () => resolveOld([first]));

    expect(result.current.suggestions[0]?.target.uri).toContain('/two');
  });

  it('discards late discovery after close and exposes no rows', async () => {
    let resolve!: (value: DiscoveredTagSuggestion[]) => void;
    vi.mocked(PubchiController.discoverTagSuggestions).mockImplementationOnce(
      () => new Promise((done) => (resolve = done)),
    );
    const { result, rerender } = renderHook(
      ({ open }) => useDiscoveredTagSuggestions('owner-1', first.target.uri, open),
      { initialProps: { open: true } },
    );

    rerender({ open: false });
    await act(async () => resolve([first]));

    expect(result.current.suggestions).toEqual([]);
  });

  it('discards old-owner discovery after an identity switch', async () => {
    let resolveOld!: (value: DiscoveredTagSuggestion[]) => void;
    vi.mocked(PubchiController.discoverTagSuggestions)
      .mockImplementationOnce(() => new Promise((resolve) => (resolveOld = resolve)))
      .mockResolvedValueOnce([{ ...first, owner: 'owner-2' }]);
    const { result, rerender } = renderHook(({ owner }) => useDiscoveredTagSuggestions(owner, first.target.uri, true), {
      initialProps: { owner: 'owner-1' },
    });

    rerender({ owner: 'owner-2' });
    await waitFor(() => expect(result.current.suggestions[0]?.owner).toBe('owner-2'));
    await act(async () => resolveOld([first]));

    expect(result.current.suggestions[0]?.owner).toBe('owner-2');
  });

  it('does not relist a target cached during the current flyout session', async () => {
    const { result, rerender } = renderHook(
      ({ targetUri }) => useDiscoveredTagSuggestions('owner-1', targetUri, true),
      { initialProps: { targetUri: first.target.uri } },
    );
    await waitFor(() => expect(result.current.suggestions).toHaveLength(1));
    rerender({ targetUri: 'pubky://author/pub/pubky.app/posts/two' });
    await waitFor(() => expect(PubchiController.discoverTagSuggestions).toHaveBeenCalledTimes(2));
    rerender({ targetUri: first.target.uri });
    await waitFor(() => expect(result.current.suggestions).toHaveLength(1));

    expect(PubchiController.discoverTagSuggestions).toHaveBeenCalledTimes(2);
  });

  it('prevents a stale reconcile result from changing state', async () => {
    let resolve!: (value: DiscoveredTagSuggestion) => void;
    vi.mocked(PubchiController.reconcileDiscoveredTagSuggestion).mockImplementationOnce(
      () => new Promise((done) => (resolve = done)),
    );
    const { result, rerender } = renderHook(
      ({ open }) => useDiscoveredTagSuggestions('owner-1', first.target.uri, open),
      { initialProps: { open: true } },
    );
    await waitFor(() => expect(result.current.suggestions).toHaveLength(1));

    const pending = result.current.reconcile(first.applicationId);
    rerender({ open: false });
    await act(async () => resolve({ ...first, status: 'applied', alreadyExisted: false }));
    await pending;

    expect(result.current.suggestions).toEqual([]);
  });

  it('prevents a stale revert result from changing state', async () => {
    let resolve!: (value: DiscoveredTagSuggestion) => void;
    vi.mocked(PubchiController.revertDiscoveredTagSuggestion).mockImplementationOnce(
      () => new Promise((done) => (resolve = done)),
    );
    const { result, rerender } = renderHook(
      ({ open }) => useDiscoveredTagSuggestions('owner-1', first.target.uri, open),
      { initialProps: { open: true } },
    );
    await waitFor(() => expect(result.current.suggestions).toHaveLength(1));

    const pending = result.current.revert(first.applicationId);
    rerender({ open: false });
    await act(async () => resolve({ ...first, status: 'reverted' }));
    await pending;

    expect(result.current.suggestions).toEqual([]);
  });

  it('keeps the row and shows an error toast when revert finalization rejects', async () => {
    vi.mocked(PubchiController.revertDiscoveredTagSuggestion).mockRejectedValueOnce(new Error('finalize failed'));
    const { result } = renderHook(() => useDiscoveredTagSuggestions('owner-1', first.target.uri, true));
    await waitFor(() => expect(result.current.suggestions).toHaveLength(1));

    await act(async () => result.current.revert(first.applicationId));

    expect(result.current.suggestions).toEqual([first]);
    expect(toast).toHaveBeenCalledTimes(1);
    expect(toast).toHaveBeenCalledWith({ variant: 'error', description: 'Could not remove this tag. Try again.' });
  });
});
