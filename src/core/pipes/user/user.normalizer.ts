import { buildUser, type Built, type User } from 'pubky-social-specs';
import { z } from 'zod';
import { ValidationErrorCode } from '@/libs/error/error.codes';
import { Err } from '@/libs/error/error.factories';
import { ErrorService } from '@/libs/error/error.types';
import type { Pubky } from '@/models/models.types';
import type { ProfileChanges, ProfileFields, UserValidatorData } from '@/pipes/pipes.types';
import type { NexusUserLink } from '@/services/nexus/nexus.types';

export type UiLink = { label: string; url: string };

// Read structure only, for a 0.x `profile.json` the package does not read: an older client may have
// published values outside today's limits. UserNormalizer.to validates the complete profile after the
// user's corrections are merged.
const publishedProfileSchema = z.object({
  name: z.string(),
  bio: z.string().nullish(),
  image: z.string().nullish(),
  links: z.array(z.object({ title: z.string(), url: z.string() })).nullish(),
  status: z.string().nullish(),
});

export class UserNormalizer {
  private constructor() {}

  /**
   * Converts UI link format ({ label, url }) to API format ({ title, url })
   * Used when transforming user input before sending to homeserver
   */
  static linksFromUi(uiLinks: UiLink[] | undefined | null): NexusUserLink[] {
    return (uiLinks ?? []).map((link) => ({ title: link.label, url: link.url }));
  }

  /**
   * Checks the shape of a `profile.json` read from the homeserver and returns its fields, filling in
   * absent optional ones.
   */
  static fromPublished(profileJson: unknown): ProfileFields {
    try {
      const profile = publishedProfileSchema.parse(profileJson);
      return {
        name: profile.name,
        bio: profile.bio ?? '',
        image: profile.image ?? null,
        links: (profile.links ?? []).map((link) => ({ title: link.title, url: link.url })),
        status: profile.status ?? null,
      };
    } catch (error) {
      throw Err.validation(ValidationErrorCode.INVALID_INPUT, 'Published profile is not a valid profile.json', {
        service: ErrorService.PubkyAppSpecs,
        operation: 'fromPublished',
        cause: error,
      });
    }
  }

  /**
   * Applies `changes` onto the published profile. A field left out of `changes` keeps its
   * published value, so a write never republishes one from a stale local copy.
   */
  static merge(published: ProfileFields, changes: ProfileChanges): ProfileFields {
    return {
      name: changes.name === undefined ? published.name : changes.name,
      bio: changes.bio === undefined ? published.bio : changes.bio,
      image: changes.image === undefined ? published.image : changes.image,
      links: changes.links === undefined ? published.links : changes.links,
      status: changes.status === undefined ? published.status : changes.status,
    };
  }

  static to(user: UserValidatorData, pubky: Pubky): Built<User> {
    try {
      return buildUser(pubky, {
        name: user.name,
        bio: user.bio || null,
        image: user.image || null,
        links: user.links?.length ? user.links.map((link) => ({ title: link.title, url: link.url })) : null,
        status: user.status || null,
      });
    } catch (error) {
      throw Err.validation(ValidationErrorCode.INVALID_INPUT, error instanceof Error ? error.message : String(error), {
        service: ErrorService.PubkyAppSpecs,
        operation: 'buildUser',
        context: { user, pubky },
        cause: error,
      });
    }
  }

  /**
   * Applies `changes` onto a stored v1 profile, keeping every member the user did not touch, the
   * ones another client added included. Display text is trimmed and a blank value clears the
   * member, as the builder does on create.
   */
  static applyChanges(stored: User, changes: ProfileChanges): User {
    const text = (value: string | null | undefined) => value?.trim() || null;
    return {
      ...stored,
      ...(changes.name !== undefined && { name: changes.name.trim() }),
      ...(changes.bio !== undefined && { bio: text(changes.bio) }),
      ...(changes.image !== undefined && { image: text(changes.image) }),
      ...(changes.status !== undefined && { status: text(changes.status) }),
      ...(changes.links !== undefined && {
        links: changes.links?.length
          ? changes.links.map((link) => ({ title: link.title.trim(), url: link.url }))
          : null,
      }),
    };
  }
}
