import { fakeOwner } from 'pubky-social-specs/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ProfileApplication } from '@/application/profile/profile';
import { ValidationErrorCode } from '@/libs/error/error.codes';
import { Logger } from '@/libs/logger/logger';
import type { Pubky } from '@/models/models.types';
import { UserDetailsModel } from '@/models/user/details/userDetails';
import { UserTtlModel } from '@/models/user/ttl/userTtl';
import type { ProfileChanges } from '@/pipes/pipes.types';
import { stubMemoryHomeserver } from '@/test-utils/homeserver';

vi.mock('@/services/nexus/bootstrap/bootstrap', () => ({ NexusBootstrapService: { ingest: vi.fn() } }));

const pubky = fakeOwner(1) as Pubky;
const PROFILE_PATH = '/pub/social/v1/profile.json';
const stored = {
  name: 'Alice',
  bio: 'Bio',
  image: `pubky://${pubky}/pub/social/v1/files/AKSZ57W2RFKHV1EHK007FQQ8TW.png`,
  links: [{ title: 'WEBSITE', url: 'https://example.com/' }],
  status: 'working',
  // A member a newer client added
  pronouns: 'they/them',
};
const refusals: { label: string; changes: ProfileChanges; field: string }[] = [
  {
    label: 'six links',
    changes: { links: Array.from({ length: 6 }, (_, i) => ({ title: `WEB${i}`, url: `https://example.com/${i}` })) },
    field: 'links',
  },
  { label: 'overlong bio', changes: { bio: 'x'.repeat(161) }, field: 'bio' },
  { label: 'short name', changes: { name: 'Al' }, field: 'name' },
  { label: 'blank name', changes: { name: '   ' }, field: 'name' },
  { label: 'invalid link', changes: { links: [{ title: 'WEBSITE', url: 'example.com' }] }, field: 'links[0].url' },
  { label: 'invalid image', changes: { image: 'not-a-uri' }, field: 'image' },
  { label: 'private image', changes: { image: `pubky://${pubky}/priv/social/v1/files/A.png` }, field: 'image' },
  { label: 'overlong status', changes: { status: 'x'.repeat(51) }, field: 'status' },
];

// Exercise the real normalizer, data model, homeserver seam and IndexedDB persistence together.
describe('ProfileApplication edit round trip on the data model', () => {
  let homeserver: ReturnType<typeof stubMemoryHomeserver>;
  const storedJson = async () =>
    JSON.parse(new TextDecoder().decode(await homeserver.session.storage.getBytes(PROFILE_PATH)));

  beforeEach(async () => {
    vi.clearAllMocks();
    homeserver = stubMemoryHomeserver(pubky);
    vi.spyOn(Logger, 'error').mockImplementation(() => {});
    vi.spyOn(Logger, 'debug').mockImplementation(() => {});
    await homeserver.session.storage.putBytes(PROFILE_PATH, new TextEncoder().encode(JSON.stringify(stored)));
    homeserver.spies.putBlob.mockClear();
    await UserDetailsModel.table.clear();
    await UserTtlModel.table.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('writes the stored profile with the change applied and every unknown member kept', async () => {
    await ProfileApplication.commitUpdate({ pubky, changes: { bio: 'New bio', status: '' } });

    expect(await storedJson()).toEqual({ ...stored, bio: 'New bio', status: null });
    expect(await UserDetailsModel.findById(pubky)).toMatchObject({
      name: 'Alice',
      bio: 'New bio',
      image: stored.image,
      links: stored.links,
      status: null,
    });
    expect(await UserTtlModel.findById(pubky)).toBeTruthy();
  });

  it.each(refusals)(
    'refuses $label before the PUT and local persistence, naming the member',
    async ({ changes, field }) => {
      await expect(ProfileApplication.commitUpdate({ pubky, changes })).rejects.toMatchObject({
        code: ValidationErrorCode.INVALID_INPUT,
        operation: 'commitUpdate',
        context: { pubky, field },
      });

      expect(homeserver.spies.putBlob).not.toHaveBeenCalled();
      expect(await storedJson()).toEqual(stored);
      expect(await UserDetailsModel.findById(pubky)).toBeNull();
      expect(await UserTtlModel.findById(pubky)).toBeNull();
    },
  );

  it.each([null, {}, { name: 42 }, { name: 'Alice', links: [{}] }, { name: 'Alice', bio: {} }, 'not json'])(
    'refuses a stored body the data model does not read even when the changes could replace it: %j',
    async (body) => {
      await homeserver.session.storage.putBytes(
        PROFILE_PATH,
        new TextEncoder().encode(typeof body === 'string' ? body : JSON.stringify(body)),
      );

      await expect(
        ProfileApplication.commitUpdate({ pubky, changes: { ...stored, links: stored.links } }),
      ).rejects.toMatchObject({
        code: ValidationErrorCode.INVALID_INPUT,
        operation: 'commitUpdate',
      });
      expect(homeserver.spies.putBlob).not.toHaveBeenCalled();
      expect(await UserDetailsModel.findById(pubky)).toBeNull();
    },
  );
});
