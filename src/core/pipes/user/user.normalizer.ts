import { PubkyAppUser, UserResult } from 'pubky-app-specs';
import { ValidationErrorCode } from '@/libs/error/error.codes';
import { Err } from '@/libs/error/error.factories';
import { ErrorService } from '@/libs/error/error.types';
import type { Pubky } from '@/models/models.types';
import { PubkySpecsSingleton } from '@/pipes/pipes.builder';
import type { ProfileChanges, ProfileFields, UserValidatorData } from '@/pipes/pipes.types';
import type { NexusUserLink } from '@/services/nexus/nexus.types';

export type UiLink = { label: string; url: string };

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
   * Validates a `profile.json` read from the homeserver and returns its fields, filling in
   * absent optional ones.
   */
  static fromPublished(profileJson: unknown): ProfileFields {
    try {
      const profile = PubkyAppUser.fromJson(profileJson);
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

  static to(user: UserValidatorData, pubky: Pubky): UserResult {
    try {
      const builder = PubkySpecsSingleton.get(pubky);
      return builder.createUser(user.name, user.bio, user.image, user.links, user.status || undefined);
    } catch (error) {
      throw Err.validation(ValidationErrorCode.INVALID_INPUT, error as string, {
        service: ErrorService.PubkyAppSpecs,
        operation: 'createUser',
        context: { user, pubky },
      });
    }
  }
}
