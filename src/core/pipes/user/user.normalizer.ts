import { UserResult } from 'pubky-app-specs';
import * as Core from '@/core';
import { ValidationErrorCode } from '@/libs/error/error.codes';
import { Err } from '@/libs/error/error.factories';
import { ErrorService } from '@/libs/error/error.types';

export type UiLink = { label: string; url: string };

export class UserNormalizer {
  private constructor() {}

  /**
   * Converts UI link format ({ label, url }) to API format ({ title, url })
   * Used when transforming user input before sending to homeserver
   */
  static linksFromUi(uiLinks: UiLink[] | undefined | null): Core.NexusUserLink[] {
    return (uiLinks ?? []).map((link) => ({ title: link.label, url: link.url }));
  }

  static to(user: Core.UserValidatorData, pubky: Core.Pubky): UserResult {
    try {
      const builder = Core.PubkySpecsSingleton.get(pubky);
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
