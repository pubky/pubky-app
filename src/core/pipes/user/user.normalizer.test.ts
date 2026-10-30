import { decodeObject, encodeObject, type User } from 'pubky-social-specs';
import { fakeOwner } from 'pubky-social-specs/testing';
import { describe, expect, it } from 'vitest';
import { AppError } from '@/libs/error/error';
import { ValidationErrorCode } from '@/libs/error/error.codes';
import { ErrorCategory, ErrorService } from '@/libs/error/error.types';
import type { Pubky } from '@/models/models.types';
import type { UserValidatorData } from '@/pipes/pipes.types';
import { UserNormalizer } from '@/pipes/user/user.normalizer';
import { asInvalid } from '@/test-utils/type-assertions';

const owner = fakeOwner(1) as Pubky;
const other = fakeOwner(2) as Pubky;
const profileUrl = `pubky://${owner}/pub/social/v1/profile.json`;
const bodyOf = (bytes: Uint8Array) => JSON.parse(new TextDecoder().decode(bytes));

const createUserData = (overrides?: Partial<UserValidatorData>): UserValidatorData => ({
  name: 'Test User',
  bio: 'A test bio',
  image: 'https://example.com/avatar.png',
  links: [{ title: 'Website', url: 'https://example.com' }],
  status: 'Available',
  ...overrides,
});

const expectRefusal = (run: () => unknown, field?: string) => {
  try {
    run();
    expect.fail('Should have thrown');
  } catch (error) {
    expect(error).toBeInstanceOf(AppError);
    const appError = error as AppError;
    expect(appError.category).toBe(ErrorCategory.Validation);
    expect(appError.code).toBe(ValidationErrorCode.INVALID_INPUT);
    expect(appError.service).toBe(ErrorService.SocialSpecs);
    expect(appError.operation).toBe('buildUser');
    expect(appError.cause).toBeInstanceOf(Error);
    if (field) expect(appError.context).toMatchObject({ pubky: owner, field });
  }
};

describe('UserNormalizer.linksFromUi', () => {
  it('maps the form labels to link titles', () => {
    expect(UserNormalizer.linksFromUi([{ label: 'Docs', url: 'https://example.com' }])).toEqual([
      { title: 'Docs', url: 'https://example.com' },
    ]);
  });

  it('maps an absent list to no links', () => {
    expect(UserNormalizer.linksFromUi(undefined)).toEqual([]);
    expect(UserNormalizer.linksFromUi(null)).toEqual([]);
  });
});

describe('UserNormalizer.to', () => {
  it('builds the v1 profile at its public path with the bytes to PUT', () => {
    const built = UserNormalizer.to(createUserData(), owner);

    expect(built.url).toBe(profileUrl);
    expect(built.path).toBe('/pub/social/v1/profile.json');
    expect(built.object).toEqual({
      name: 'Test User',
      bio: 'A test bio',
      image: 'https://example.com/avatar.png',
      links: [{ title: 'Website', url: 'https://example.com' }],
      status: 'Available',
    });
    expect(bodyOf(built.body)).toEqual(built.object);
  });

  it('builds the profile under the given owner', () => {
    expect(UserNormalizer.to(createUserData(), other).url).toBe(`pubky://${other}/pub/social/v1/profile.json`);
  });

  it('stores a blank bio, image, status or link list as null', () => {
    const built = UserNormalizer.to(createUserData({ bio: '', image: null, links: [], status: '' }), owner);

    expect(built.object).toEqual({ name: 'Test User', bio: null, image: null, links: null, status: null });
  });

  it('stores a null status and link list as null', () => {
    const built = UserNormalizer.to(createUserData({ links: null, status: null }), owner);

    expect(built.object).toMatchObject({ links: null, status: null });
  });

  it('keeps only the title and url of each link', () => {
    const links = [
      { title: 'Twitter', url: 'https://twitter.com/user' },
      { title: 'GitHub', url: 'https://github.com/user' },
    ];

    expect(UserNormalizer.to(createUserData({ links }), owner).object.links).toEqual(links);
  });

  it('accepts a pubky avatar under the public root', () => {
    const image = `pubky://${owner}/pub/social/v1/files/AKSZ57W2RFKHV1EHK007FQQ8TW.png`;

    expect(UserNormalizer.to(createUserData({ image }), owner).object.image).toBe(image);
  });

  it('accepts unicode and emoji text', () => {
    const built = UserNormalizer.to(
      createUserData({ name: '用户名 🎉 مستخدم', bio: 'Bio with <html> & "quotes"', status: '🚀 Working' }),
      owner,
    );

    expect(built.object).toMatchObject({ name: '用户名 🎉 مستخدم', status: '🚀 Working' });
  });

  describe('limits', () => {
    it.each([
      ['name at 50 code points', { name: '🎉'.repeat(50) }],
      ['name at 3 code points', { name: 'ABC' }],
      ['bio at 160 code points', { bio: '🚀'.repeat(160) }],
      ['status at 50 code points', { status: '⭐'.repeat(50) }],
      ['image URL at 300 code points', { image: `https://example.com/${'A'.repeat(280)}` }],
      ['five links', { links: Array.from({ length: 5 }, (_, i) => ({ title: `L${i}`, url: `https://e.com/${i}` })) }],
      ['link title at 100 code points', { links: [{ title: 'T'.repeat(100), url: 'https://example.com' }] }],
      ['link URL at 300 code points', { links: [{ title: 'W', url: `https://example.com/${'A'.repeat(280)}` }] }],
    ])('accepts a %s', (_, overrides) => {
      expect(UserNormalizer.to(createUserData(overrides), owner).object).toMatchObject(overrides);
    });

    it.each([
      ['empty name', { name: '' }, 'name'],
      ['two-character name', { name: 'AB' }, 'name'],
      ['name over 50 code points', { name: '🎉'.repeat(51) }, 'name'],
      ['bio over 160 code points', { bio: '🚀'.repeat(161) }, 'bio'],
      ['status over 50 code points', { status: '⭐'.repeat(51) }, 'status'],
      ['image URL over 300 code points', { image: `https://example.com/${'A'.repeat(281)}` }, 'image'],
      ['image that is no URI', { image: 'not-a-uri' }, 'image'],
      ['image under the private root', { image: `pubky://${owner}/priv/social/v1/files/A.png` }, 'image'],
      [
        'six links',
        { links: Array.from({ length: 6 }, (_, i) => ({ title: `L${i}`, url: `https://e.com/${i}` })) },
        'links',
      ],
      [
        'link title over 100 code points',
        { links: [{ title: 'T'.repeat(101), url: 'https://example.com' }] },
        'links[0].title',
      ],
      [
        'link URL over 300 code points',
        { links: [{ title: 'W', url: `https://example.com/${'A'.repeat(281)}` }] },
        'links[0].url',
      ],
      ['link that is no web URL', { links: [{ title: 'W', url: 'example.com' }] }, 'links[0].url'],
    ])('refuses a %s as a validation AppError naming the member', (_, overrides, field) => {
      expectRefusal(() => UserNormalizer.to(createUserData(overrides), owner), field);
    });
  });

  it('refuses a name of the wrong type as a validation AppError', () => {
    expectRefusal(() => UserNormalizer.to(createUserData({ name: asInvalid<string>(null) }), owner));
  });

  it('refuses a malformed owner key', () => {
    expectRefusal(() => UserNormalizer.to(createUserData(), 'not-a-key' as Pubky));
  });
});

describe('UserNormalizer.applyChanges', () => {
  const stored: User = {
    name: 'Published Name',
    bio: 'Published bio',
    image: `pubky://${owner}/pub/social/v1/files/AKSZ57W2RFKHV1EHK007FQQ8TW.png`,
    links: [{ title: 'WEBSITE', url: 'https://example.com/' }],
    status: 'working',
  };

  it('keeps every stored member the changes leave out', () => {
    expect(UserNormalizer.applyChanges(stored, { status: '🪚building' })).toEqual({ ...stored, status: '🪚building' });
  });

  it('keeps the members a newer writer added, on the profile and on its links', () => {
    const bytes = new TextEncoder().encode(
      JSON.stringify({ ...stored, links: [{ ...stored.links![0], icon: 'globe' }], theme: 'dark' }),
    );
    const decoded = decodeObject(profileUrl, bytes, 'user');

    const edited = UserNormalizer.applyChanges(decoded, { bio: 'New bio' });

    expect(edited.$unknown).toBe(decoded.$unknown);
    expect(edited.links).toBe(decoded.links);
    expect(bodyOf(encodeObject(profileUrl, edited))).toEqual({
      ...stored,
      bio: 'New bio',
      links: [{ ...stored.links![0], icon: 'globe' }],
      theme: 'dark',
    });
  });

  it('clears a member given blank, null or empty', () => {
    expect(UserNormalizer.applyChanges(stored, { bio: '', image: null, links: [], status: '  ' })).toEqual({
      name: 'Published Name',
      bio: null,
      image: null,
      links: null,
      status: null,
    });
  });

  it('trims display text as the builder does', () => {
    expect(
      UserNormalizer.applyChanges(stored, {
        name: '  New Name ',
        bio: ' bio ',
        status: ' away ',
        links: [{ title: ' GITHUB ', url: 'https://github.com/example' }],
      }),
    ).toEqual({
      ...stored,
      name: 'New Name',
      bio: 'bio',
      status: 'away',
      links: [{ title: 'GITHUB', url: 'https://github.com/example' }],
    });
  });

  it('keeps the members a newer writer stored on a link the edit keeps, matched by URL', () => {
    const bytes = new TextEncoder().encode(
      JSON.stringify({
        ...stored,
        links: [
          { title: 'WEBSITE', url: 'https://example.com/', icon: 'globe' },
          { title: 'OLD', url: 'https://old.example.com/', icon: 'archive' },
        ],
      }),
    );
    const decoded = decodeObject(profileUrl, bytes, 'user');

    const edited = UserNormalizer.applyChanges(decoded, {
      links: [
        { title: 'X (TWITTER)', url: 'https://x.com/alice' },
        { title: 'HOMEPAGE', url: 'https://example.com/' },
      ],
    });

    expect(edited.links).toEqual([
      { title: 'X (TWITTER)', url: 'https://x.com/alice' },
      { title: 'HOMEPAGE', url: 'https://example.com/', $unknown: JSON.stringify({ icon: 'globe' }) },
    ]);
    expect(bodyOf(encodeObject(profileUrl, edited)).links).toEqual([
      { title: 'X (TWITTER)', url: 'https://x.com/alice' },
      { title: 'HOMEPAGE', url: 'https://example.com/', icon: 'globe' },
    ]);
  });

  it('replaces the whole link list when links change', () => {
    const links = [{ title: 'GITHUB', url: 'https://github.com/example' }];

    expect(UserNormalizer.applyChanges(stored, { name: 'New Name', links })).toEqual({
      ...stored,
      name: 'New Name',
      links,
    });
  });

  it('leaves the result to the encoder to re-check: a rule break is refused there', () => {
    const edited = UserNormalizer.applyChanges(stored, { bio: 'x'.repeat(161) });

    expect(() => encodeObject(profileUrl, edited)).toThrow(/bio/);
  });
});
