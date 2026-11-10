import { buildTag } from 'pubky-social-specs';
import { fakeOwner } from 'pubky-social-specs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TagApplication } from '@/application/tag/tag';
import type { Pubky } from '@/models/models.types';
import { useAuthStore } from '@/stores/auth/auth.store';
import { mockSession } from '@/test-utils/pubky';
import { TagController } from './tag';

vi.mock('@/application/tag/tag', () => ({
  TagApplication: {
    fetchResourceTags: vi.fn(),
    commitCreateResource: vi.fn(),
    commitDeleteResource: vi.fn(),
  },
}));

const VIEWER = fakeOwner(1) as Pubky;
const URI = 'https://www.openstreetmap.org/node/240109189';

describe('TagController, external resources', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    useAuthStore.setState({ currentUserPubky: VIEWER, session: mockSession() });
  });

  it('reads the link’s tags for the viewer', async () => {
    vi.mocked(TagApplication.fetchResourceTags).mockResolvedValue([]);

    await TagController.fetchResourceTags({ uri: URI, viewerId: VIEWER });

    expect(TagApplication.fetchResourceTags).toHaveBeenCalledWith({ uri: URI, viewerId: VIEWER });
  });

  it('writes a social v1 tag whose uri is the link, with the stored label', async () => {
    const result = await TagController.commitCreateResource({ taggerId: VIEWER, uri: URI, label: '  Berlin ' });

    const [write, viewerTag] = vi.mocked(TagApplication.commitCreateResource).mock.calls[0];
    expect(write.tagUrl).toMatch(new RegExp(`^pubky://${VIEWER}/pub/social/v1/tags/[^/]+\\.json$`));
    const body = JSON.parse(new TextDecoder().decode(write.tagBody));
    expect(body).toMatchObject({ uri: URI, label: 'berlin' });
    expect(typeof body.created_at).toBe('number');
    expect(viewerTag).toEqual({ uri: URI, label: 'berlin', viewerId: VIEWER });
    expect(result).toEqual({ label: 'berlin', tagUri: write.tagUrl });
  });

  it('builds the same file for the same link and label, so a delete names it', async () => {
    await TagController.commitCreateResource({ taggerId: VIEWER, uri: URI, label: 'berlin' });
    await TagController.commitDeleteResource({ taggerId: VIEWER, uri: URI, label: 'berlin' });

    const created = vi.mocked(TagApplication.commitCreateResource).mock.calls[0][0].tagUrl;
    const [deleted, viewerTag] = vi.mocked(TagApplication.commitDeleteResource).mock.calls[0];
    expect(deleted.tagUri).toBe(created);
    expect(deleted.tagUri).toBe(buildTag(VIEWER, URI, 'berlin').url);
    expect(viewerTag).toEqual({ uri: URI, label: 'berlin', viewerId: VIEWER });
  });

  it('deletes the viewer’s own tag file Nexus reports, wherever another app wrote it', async () => {
    const tagUri = `pubky://${VIEWER}/pub/mapky/tags/0123ABC`;

    await TagController.commitDeleteResource({ taggerId: VIEWER, uri: URI, label: 'berlin', tagUri });

    expect(vi.mocked(TagApplication.commitDeleteResource).mock.calls[0][0].tagUri).toBe(tagUri);
  });

  it('never deletes a tag file of another user, building the viewer’s own instead', async () => {
    const tagUri = `pubky://${fakeOwner(2)}/pub/social/v1/tags/0123ABC.json`;

    await TagController.commitDeleteResource({ taggerId: VIEWER, uri: URI, label: 'berlin', tagUri });

    expect(vi.mocked(TagApplication.commitDeleteResource).mock.calls[0][0].tagUri).toBe(
      buildTag(VIEWER, URI, 'berlin').url,
    );
  });

  it('refuses a label the data model refuses', async () => {
    await expect(TagController.commitCreateResource({ taggerId: VIEWER, uri: URI, label: '   ' })).rejects.toThrow();
    expect(TagApplication.commitCreateResource).not.toHaveBeenCalled();
  });
});
