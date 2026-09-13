import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TagApplication } from '@/application/tag/tag';
import { TagKind, type TCreateTagInput } from '@/application/tag/tag.types';
import { TagNormalizer } from '@/pipes/tag/tag.normalizer';
import { useAuthStore } from '@/stores/auth/auth.store';
import { mockSession } from '@/test-utils/pubky';
import { TagController } from './tag';

vi.mock('@/application/tag/tag', () => ({
  TagApplication: {
    commitCreate: vi.fn(),
    commitDelete: vi.fn(),
    getViewerMutations: vi.fn(),
  },
}));
vi.mock('@/pipes/tag/tag.normalizer', () => ({ TagNormalizer: { from: vi.fn() } }));

describe('TagController', () => {
  const normalized: TCreateTagInput = {
    taggedId: 'author:post',
    taggerId: 'viewer',
    label: 'bitcoin',
    taggedKind: TagKind.POST,
    tagUrl: 'pubky://viewer/pub/pubky.app/tags/tag',
    tagJson: { label: 'bitcoin' },
  };
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(TagNormalizer.from).mockReturnValue(normalized);
    vi.mocked(TagApplication.commitCreate).mockResolvedValue(undefined);
    vi.mocked(TagApplication.commitDelete).mockResolvedValue(undefined);
    useAuthStore.setState({ currentUserPubky: 'viewer', session: mockSession() });
  });

  it.each([TagKind.POST, TagKind.USER])('passes normalized %s create data to the application', async (taggedKind) => {
    const params = { ...normalized, label: '  Bitcoin  ', taggedKind };
    const tag = { ...normalized, taggedKind };
    vi.mocked(TagNormalizer.from).mockReturnValue(tag);
    await TagController.commitCreate(params);
    expect(TagNormalizer.from).toHaveBeenCalledWith(params);
    expect(TagApplication.commitCreate).toHaveBeenCalledWith({ tagList: [tag], isCurrent: expect.any(Function) });
  });

  it('passes normalized deletion data without the JSON body', async () => {
    await TagController.commitDelete(normalized);
    const { tagJson: _tagJson, ...deleted } = normalized;
    expect(TagApplication.commitDelete).toHaveBeenCalledWith({ ...deleted, isCurrent: expect.any(Function) });
  });

  it('expires the predicate on logout and same-account re-login', async () => {
    await TagController.commitCreate(normalized);
    const isCurrent = vi.mocked(TagApplication.commitCreate).mock.calls[0][0].isCurrent!;
    expect(isCurrent()).toBe(true);
    useAuthStore.setState({ currentUserPubky: null, session: null });
    expect(isCurrent()).toBe(false);
    useAuthStore.setState({ currentUserPubky: 'viewer', session: mockSession() });
    expect(isCurrent()).toBe(false);
  });

  it('propagates application failures to the action hook', async () => {
    vi.mocked(TagApplication.commitCreate).mockRejectedValue(new Error('offline'));
    await expect(TagController.commitCreate(normalized)).rejects.toThrow('offline');
  });

  it('reads persisted viewer intent through the application', async () => {
    const entries = new Map();
    vi.mocked(TagApplication.getViewerMutations).mockResolvedValue(entries);
    const params = { taggedId: 'author:post', taggerId: 'viewer', taggedKind: TagKind.POST };
    expect(await TagController.getViewerMutations(params)).toBe(entries);
    expect(TagApplication.getViewerMutations).toHaveBeenCalledWith(params);
  });
});
