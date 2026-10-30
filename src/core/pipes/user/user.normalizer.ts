import { buildUser, type Built, type User, ValidationError } from 'pubky-social-specs';
import { ValidationErrorCode } from '@/libs/error/error.codes';
import { Err } from '@/libs/error/error.factories';
import { ErrorService } from '@/libs/error/error.types';
import type { Pubky } from '@/models/models.types';
import type { ProfileChanges, UserValidatorData } from '@/pipes/pipes.types';
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
   * Builds the profile the data model stores at `/pub/social/v1/profile.json`: the bytes to PUT
   * and the object as stored. The builder trims the display text, stores a blank value as
   * `null` and refuses a value outside the profile rules (a name shorter than 3 code points, an
   * avatar that is no canonical pubky or web URI or is under `/priv/`, a link that is no
   * `http(s)` URL, …); the refusal names the member in `context.field`.
   */
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
        service: ErrorService.SocialSpecs,
        operation: 'buildUser',
        context: { pubky, ...(error instanceof ValidationError && { code: error.code, field: error.field }) },
        cause: error,
      });
    }
  }

  /**
   * Applies `changes` onto a stored profile. A member left out of `changes` keeps its stored
   * value, and the spread keeps `$unknown`, the members a newer writer added, so an edit from
   * this client never drops them. Display text is trimmed and a blank value clears the member,
   * as `buildUser` does; `encodeObject` re-checks every profile rule on the result.
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
