import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TagApplication } from '@/application/tag/tag';
import { TagKind, type TCreateTagInput } from '@/application/tag/tag.types';
import { TagNormalizer } from '@/pipes/tag/tag.normalizer';
import { useAuthStore } from '@/stores/auth/auth.store';
import { mockRingSession, mockSession } from '@/test-utils/pubky';
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

  it('passes normalized deletion data without a rebuilt tag URL or JSON body', async () => {
    await TagController.commitDelete(normalized);
    const { tagJson: _tagJson, tagUrl: _tagUrl, ...deleted } = normalized;
    expect(TagApplication.commitDelete).toHaveBeenCalledWith({
      ...deleted,
      isCurrent: expect.any(Function),
      canWrite: expect.any(Function),
    });
  });

  it('lets a root session delete any app tag file but a Ring session only its granted folders', async () => {
    const mapky = 'pubky://viewer/pub/mapky/tags/MAPKY01';
    const app = 'pubky://viewer/pub/pubky.app/tags/TAG01';
    await TagController.commitDelete(normalized);
    const root = vi.mocked(TagApplication.commitDelete).mock.calls[0][0].canWrite!;
    expect(root(mapky)).toBe(true);

    useAuthStore.setState({ session: mockRingSession(['/pub/pubky.app/:rw']) });
    await TagController.commitDelete(normalized);
    const ring = vi.mocked(TagApplication.commitDelete).mock.calls[1][0].canWrite!;
    expect(ring(app)).toBe(true);
    expect(ring(mapky)).toBe(false);

    useAuthStore.setState({ session: null });
    await TagController.commitDelete(normalized);
    expect(vi.mocked(TagApplication.commitDelete).mock.calls[2][0].canWrite!(app)).toBe(false);
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
