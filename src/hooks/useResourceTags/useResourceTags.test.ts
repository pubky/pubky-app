import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TagController } from '@/controllers/tag/tag';
import { showTagWriteErrorToast } from '@/molecules/TaggedItem/TaggedItem.utils';
import type { NexusTag } from '@/services/nexus/nexus.types';
import { RESOURCE_TAGS_LIMIT } from '@/services/nexus/resource/resource.constants';
import { useAuthStore } from '@/stores/auth/auth.store';
import { useResourceTags } from './useResourceTags';

const mocks = vi.hoisted(() => ({
  waitForAuth: vi.fn(),
  unsubscribe: vi.fn(),
  /** The listener the hook subscribed with: another reader's change of the shared answer. */
  publish: (_tags: unknown[]) => {},
}));

vi.mock('@/controllers/tag/tag', () => ({
  TagController: {
    fetchResourceTags: vi.fn(),
    subscribeResourceTags: vi.fn(),
    commitCreateResource: vi.fn(),
    commitDeleteResource: vi.fn(),
  },
}));
vi.mock('@/hooks/useRequireAuth/useRequireAuth', () => ({
  useRequireAuth: () => ({ waitForAuth: mocks.waitForAuth }),
}));
vi.mock('@/molecules/TaggedItem/TaggedItem.utils', () => ({ showTagWriteErrorToast: vi.fn() }));

const URI = 'https://www.openstreetmap.org/node/240109189';
const VIEWER = 'viewer';
const OWN_TAG_URI = `pubky://${VIEWER}/pub/mapky/tags/OWN`;
const TAGS: NexusTag[] = [
  { label: 'berlin', taggers: ['a', 'b', 'c'], taggers_count: 3, relationship: false, tag_uri: null },
  { label: 'city', taggers: [VIEWER], taggers_count: 1, relationship: true, tag_uri: OWN_TAG_URI },
];

describe('useResourceTags', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.waitForAuth.mockResolvedValue(true);
    useAuthStore.setState({ currentUserPubky: VIEWER });
    vi.mocked(TagController.fetchResourceTags).mockResolvedValue(TAGS);
    vi.mocked(TagController.subscribeResourceTags).mockImplementation((_params, listener) => {
      mocks.publish = (tags) => listener(tags as NexusTag[]);
      return mocks.unsubscribe;
    });
    vi.mocked(TagController.commitCreateResource).mockResolvedValue({ label: 'travel', tagUri: 'pubky://new' });
    vi.mocked(TagController.commitDeleteResource).mockResolvedValue(undefined);
  });

  it('reads the link’s tags for the viewer', async () => {
    const { result } = renderHook(() => useResourceTags(URI));

    expect(result.current.isLoading).toBe(true);
    await waitFor(() => expect(result.current.tags).toEqual(TAGS));
    expect(TagController.fetchResourceTags).toHaveBeenCalledWith({ uri: URI, viewerId: VIEWER });
  });

  it('says when Nexus answered with as many tags as it is asked for', async () => {
    const full = Array.from({ length: RESOURCE_TAGS_LIMIT }, (_, index) => ({ ...TAGS[0], label: `tag${index}` }));
    vi.mocked(TagController.fetchResourceTags).mockResolvedValueOnce(TAGS).mockResolvedValueOnce(full);

    const first = renderHook(() => useResourceTags(URI));
    await waitFor(() => expect(first.result.current.tags).toEqual(TAGS));
    expect(first.result.current.isAtReadLimit).toBe(false);

    const second = renderHook(() => useResourceTags(`${URI}?full`));
    await waitFor(() => expect(second.result.current.tags).toHaveLength(RESOURCE_TAGS_LIMIT));
    expect(second.result.current.isAtReadLimit).toBe(true);
  });

  it('stays a lower bound when the viewer removes a tag from a full answer', async () => {
    const full: NexusTag[] = Array.from({ length: RESOURCE_TAGS_LIMIT }, (_, index) => ({
      label: `tag${index}`,
      taggers: [VIEWER],
      taggers_count: 1,
      relationship: true,
      tag_uri: `pubky://tag${index}`,
    }));
    vi.mocked(TagController.fetchResourceTags).mockResolvedValue(full);
    const { result } = renderHook(() => useResourceTags(URI));
    await waitFor(() => expect(result.current.isAtReadLimit).toBe(true));

    await act(async () => {
      await result.current.toggleTag(full[0]);
    });
    expect(result.current.tags).toHaveLength(RESOURCE_TAGS_LIMIT - 1);
    expect(result.current.isAtReadLimit).toBe(true);

    act(() => mocks.publish(full.slice(1)));
    expect(result.current.isAtReadLimit).toBe(true);
  });

  it('follows the shared answer when another card of the link writes, and stops on unmount', async () => {
    const { result, unmount } = renderHook(() => useResourceTags(URI));
    await waitFor(() => expect(result.current.tags).toEqual(TAGS));
    expect(TagController.subscribeResourceTags).toHaveBeenCalledWith(
      { uri: URI, viewerId: VIEWER },
      expect.any(Function),
    );

    const tagged: NexusTag = { label: 'travel', taggers: [VIEWER], taggers_count: 1, relationship: true, tag_uri: 'x' };
    act(() => mocks.publish([...TAGS, tagged]));

    expect(result.current.tags.map((tag) => tag.label)).toEqual(['berlin', 'city', 'travel']);
    unmount();
    expect(mocks.unsubscribe).toHaveBeenCalledTimes(1);
  });

  it('keeps its own write in flight over a change of the shared answer', async () => {
    vi.mocked(TagController.commitCreateResource).mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() => useResourceTags(URI));
    await waitFor(() => expect(result.current.tags).toHaveLength(2));

    act(() => {
      void result.current.addTag('travel');
    });
    await waitFor(() => expect(result.current.tags).toHaveLength(3));
    act(() => mocks.publish(TAGS));

    expect(result.current.tags.map((tag) => tag.label)).toEqual(['berlin', 'city', 'travel']);
  });

  it('reads nothing without a link', () => {
    const { result } = renderHook(() => useResourceTags(null));

    expect(result.current).toMatchObject({ tags: [], isLoading: false });
    expect(TagController.fetchResourceTags).not.toHaveBeenCalled();
  });

  it('defers the read while disabled, still loading, and reads once enabled', async () => {
    const { result, rerender } = renderHook(({ enabled }) => useResourceTags(URI, { enabled }), {
      initialProps: { enabled: false },
    });

    expect(result.current).toMatchObject({ tags: [], isLoading: true });
    expect(TagController.fetchResourceTags).not.toHaveBeenCalled();

    rerender({ enabled: true });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(TagController.fetchResourceTags).toHaveBeenCalledTimes(1);
  });

  it('shows no tags when the read fails', async () => {
    vi.mocked(TagController.fetchResourceTags).mockRejectedValue(new Error('down'));
    const { result } = renderHook(() => useResourceTags(URI));

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.tags).toEqual([]);
  });

  it('shows an added tag at once and keeps the file it wrote', async () => {
    let resolveWrite: (value: { label: string; tagUri: string }) => void = () => {};
    vi.mocked(TagController.commitCreateResource).mockReturnValue(
      new Promise((resolve) => {
        resolveWrite = resolve;
      }),
    );
    const { result } = renderHook(() => useResourceTags(URI));
    await waitFor(() => expect(result.current.tags).toHaveLength(2));

    let write: Promise<{ success: boolean }> = Promise.resolve({ success: false });
    act(() => {
      write = result.current.addTag(' Travel ');
    });
    await waitFor(() => expect(result.current.tags.map((tag) => tag.label)).toEqual(['berlin', 'city', 'travel']));
    expect(result.current.tags[2]).toMatchObject({ relationship: true, taggers_count: 1 });

    await act(async () => {
      resolveWrite({ label: 'travel', tagUri: 'pubky://new' });
      await expect(write).resolves.toEqual({ success: true });
    });
    expect(TagController.commitCreateResource).toHaveBeenCalledWith({ taggerId: VIEWER, uri: URI, label: 'travel' });
    expect(result.current.tags[2].tag_uri).toBe('pubky://new');
  });

  it('undoes an add the homeserver refused, with an error toast', async () => {
    vi.mocked(TagController.commitCreateResource).mockRejectedValue(new Error('refused'));
    const { result } = renderHook(() => useResourceTags(URI));
    await waitFor(() => expect(result.current.tags).toHaveLength(2));

    await act(async () => {
      await expect(result.current.addTag('berlin')).resolves.toEqual({ success: false });
    });

    expect(result.current.tags).toEqual(TAGS);
    expect(showTagWriteErrorToast).toHaveBeenCalledWith(expect.any(Error), 'Could not add tag');
  });

  it('removes the viewer’s tag with the file Nexus reported', async () => {
    const { result } = renderHook(() => useResourceTags(URI));
    await waitFor(() => expect(result.current.tags).toHaveLength(2));

    await act(async () => {
      await result.current.toggleTag(TAGS[1]);
    });

    expect(TagController.commitDeleteResource).toHaveBeenCalledWith({
      taggerId: VIEWER,
      uri: URI,
      label: 'city',
      tagUri: OWN_TAG_URI,
    });
    expect(result.current.tags.map((tag) => tag.label)).toEqual(['berlin']);
  });

  it('puts a removed tag back when the delete fails', async () => {
    vi.mocked(TagController.commitDeleteResource).mockRejectedValue(new Error('refused'));
    const { result } = renderHook(() => useResourceTags(URI));
    await waitFor(() => expect(result.current.tags).toHaveLength(2));

    await act(async () => {
      await result.current.toggleTag(TAGS[1]);
    });

    expect(result.current.tags[1]).toMatchObject({ label: 'city', relationship: true, tag_uri: OWN_TAG_URI });
    expect(showTagWriteErrorToast).toHaveBeenCalledWith(expect.any(Error), 'Could not remove tag');
  });

  it('adds the viewer to a label others hold when toggled', async () => {
    const { result } = renderHook(() => useResourceTags(URI));
    await waitFor(() => expect(result.current.tags).toHaveLength(2));

    await act(async () => {
      await result.current.toggleTag(TAGS[0]);
    });

    expect(TagController.commitCreateResource).toHaveBeenCalledWith({ taggerId: VIEWER, uri: URI, label: 'berlin' });
    expect(result.current.tags[0]).toMatchObject({ taggers_count: 4, relationship: true });
  });

  it('writes nothing for a label the viewer already holds', async () => {
    const { result } = renderHook(() => useResourceTags(URI));
    await waitFor(() => expect(result.current.tags).toHaveLength(2));

    await act(async () => {
      await expect(result.current.addTag('City')).resolves.toEqual({ success: true });
    });
    expect(TagController.commitCreateResource).not.toHaveBeenCalled();
  });

  it('writes nothing when the viewer does not sign in', async () => {
    mocks.waitForAuth.mockResolvedValue(false);
    const { result } = renderHook(() => useResourceTags(URI));
    await waitFor(() => expect(result.current.tags).toHaveLength(2));

    await act(async () => {
      await expect(result.current.addTag('travel')).resolves.toEqual({ success: false });
    });
    expect(TagController.commitCreateResource).not.toHaveBeenCalled();
    expect(result.current.tags).toEqual(TAGS);
  });
});
