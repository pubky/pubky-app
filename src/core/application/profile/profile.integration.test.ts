import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ProfileApplication } from '@/application/profile/profile';
import { ValidationErrorCode } from '@/libs/error/error.codes';
import { HttpMethod } from '@/libs/http/http.types';
import { UserDetailsModel } from '@/models/user/details/userDetails';
import { UserTtlModel } from '@/models/user/ttl/userTtl';
import type { ProfileChanges, ProfileFields } from '@/pipes/pipes.types';
import { HomeserverService } from '@/services/homeserver/homeserver';

vi.mock('@/services/homeserver/homeserver', () => ({
  HomeserverService: { getFreshJson: vi.fn(), request: vi.fn() },
}));
vi.mock('@/services/nexus/bootstrap/bootstrap', () => ({ NexusBootstrapService: { ingest: vi.fn() } }));

const pubky = '5a1diz4pghi47ywdfyfzpit5f3bdomzt4pugpbmq4rngdd4iub4y';
const valid: ProfileFields = {
  name: 'Alice',
  bio: 'Bio',
  image: `pubky://${pubky}/pub/pubky.app/files/0035S78QPP4S0`,
  links: [{ title: 'WEBSITE', url: 'https://example.com/' }],
  status: 'working',
};
const repairs: { label: string; invalid: Partial<ProfileFields>; changes: ProfileChanges }[] = [
  {
    label: 'six links',
    invalid: { links: Array.from({ length: 6 }, (_, i) => ({ title: `WEB${i}`, url: `https://example.com/${i}` })) },
    changes: { links: valid.links },
  },
  { label: 'overlong bio', invalid: { bio: 'x'.repeat(161) }, changes: { bio: valid.bio } },
  { label: 'short name', invalid: { name: 'Al' }, changes: { name: valid.name } },
  {
    label: 'invalid link',
    invalid: { links: [{ title: 'WEBSITE', url: 'example.com' }] },
    changes: { links: valid.links },
  },
  { label: 'invalid image', invalid: { image: 'not-a-uri' }, changes: { image: valid.image } },
  { label: 'overlong status', invalid: { status: 'x'.repeat(51) }, changes: { status: valid.status } },
];

// Exercise the real normalizer, SDK validation and IndexedDB persistence together.
describe('ProfileApplication published profile repair', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await UserDetailsModel.table.clear();
    await UserTtlModel.table.clear();
  });

  it.each(repairs)(
    'repairs $label before validating and persists exactly the published result',
    async ({ invalid, changes }) => {
      vi.mocked(HomeserverService.getFreshJson).mockResolvedValue({ ...valid, ...invalid });

      await ProfileApplication.commitUpdate({ pubky, changes });

      expect(HomeserverService.request).toHaveBeenCalledExactlyOnceWith({
        method: HttpMethod.PUT,
        url: `pubky://${pubky}/pub/pubky.app/profile.json`,
        bodyJson: valid,
      });
      expect(await UserDetailsModel.findById(pubky)).toMatchObject(valid);
      expect(await UserTtlModel.findById(pubky)).toBeTruthy();
    },
  );

  it('still rejects an invalid merged profile before PUT or local persistence', async () => {
    vi.mocked(HomeserverService.getFreshJson).mockResolvedValue({ ...valid, bio: 'x'.repeat(161) });

    await expect(ProfileApplication.commitUpdateStatus({ pubky, status: 'building' })).rejects.toMatchObject({
      code: ValidationErrorCode.INVALID_INPUT,
      operation: 'createUser',
    });
    expect(HomeserverService.request).not.toHaveBeenCalled();
    expect(await UserDetailsModel.findById(pubky)).toBeNull();
    expect(await UserTtlModel.findById(pubky)).toBeNull();
  });

  it.each([null, {}, { name: 42 }, { name: 'Alice', links: [{}] }, { name: 'Alice', bio: {} }])(
    'rejects a malformed published body even when changes could replace it: %j',
    async (body) => {
      vi.mocked(HomeserverService.getFreshJson).mockResolvedValue(body);
      await expect(ProfileApplication.commitUpdate({ pubky, changes: valid })).rejects.toMatchObject({
        code: ValidationErrorCode.INVALID_INPUT,
        operation: 'fromPublished',
      });
      expect(HomeserverService.request).not.toHaveBeenCalled();
      expect(await UserDetailsModel.findById(pubky)).toBeNull();
    },
  );
});
