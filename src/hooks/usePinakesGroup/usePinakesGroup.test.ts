import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import groupFixture from '@/services/pinakes/fixtures/group.video.json';
import { usePinakesGroup } from './usePinakesGroup';

const mocks = vi.hoisted(() => ({ configured: true, fetchGroup: vi.fn(), getCachedGroup: vi.fn() }));

vi.mock('@/config/pinakes', () => ({ isPinakesConfigured: () => mocks.configured }));
vi.mock('@/controllers/pinakes/pinakes', () => ({
  PinakesController: { fetchGroup: mocks.fetchGroup, getCachedGroup: mocks.getCachedGroup },
}));

describe('usePinakesGroup', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.configured = true;
  });

  it('reads the group members', async () => {
    mocks.fetchGroup.mockResolvedValue(groupFixture);

    const { result } = renderHook(() => usePinakesGroup(groupFixture.id));

    await waitFor(() => expect(result.current.data?.members).toHaveLength(groupFixture.members.length));
    expect(mocks.fetchGroup).toHaveBeenCalledWith({ id: groupFixture.id });
  });

  it('reads nothing for a card without a group', () => {
    const { result } = renderHook(() => usePinakesGroup(null));

    expect(result.current.data).toBeNull();
    expect(mocks.fetchGroup).not.toHaveBeenCalled();
  });

  it('only takes a group already read with `cachedOnly` (a card in a feed): never asks Pinakes', async () => {
    mocks.getCachedGroup.mockReturnValue(groupFixture);
    const { result } = renderHook(() => usePinakesGroup(groupFixture.id, { cachedOnly: true }));

    await waitFor(() => expect(result.current.data).toEqual(groupFixture));
    expect(mocks.getCachedGroup).toHaveBeenCalledWith({ id: groupFixture.id });
    expect(mocks.fetchGroup).not.toHaveBeenCalled();
  });

  it('has no group with `cachedOnly` when none was read', async () => {
    mocks.getCachedGroup.mockReturnValue(undefined);
    const { result } = renderHook(() => usePinakesGroup(groupFixture.id, { cachedOnly: true }));

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.data).toBeNull();
    expect(mocks.fetchGroup).not.toHaveBeenCalled();
  });

  it('makes no request when Pinakes is not configured', () => {
    mocks.configured = false;

    renderHook(() => usePinakesGroup(groupFixture.id));

    expect(mocks.fetchGroup).not.toHaveBeenCalled();
  });
});
