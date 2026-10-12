import { buildMute, type Built, deletionPaths, type Mute, type Owner } from 'pubky-social-specs';
import type { TMuteParams } from '@/controllers/mute/mute.types';
import { ValidationErrorCode } from '@/libs/error/error.codes';
import { Err } from '@/libs/error/error.factories';
import { ErrorService } from '@/libs/error/error.types';
import { stripPubkyPrefix } from '@/libs/utils/utils';
import { ownerPathToUrl } from '@/pipes/pipes.utils';

export class MuteNormalizer {
  private constructor() {}

  static to({ muter, mutee }: TMuteParams): Built<Mute, Owner, 'mute'> {
    try {
      // The builder takes a bare 52-character z-base-32 key
      return buildMute(muter, stripPubkyPrefix(mutee));
    } catch (error) {
      throw Err.validation(ValidationErrorCode.INVALID_INPUT, error instanceof Error ? error.message : String(error), {
        service: ErrorService.PubkyAppSpecs,
        operation: 'buildMute',
        context: { muter, mutee },
        cause: error,
      });
    }
  }

  /** Every copy an unmute deletes: the 0.x mute first, then the v1 one. */
  static toDeleteUrls({ muter, mutee }: TMuteParams): string[] {
    return deletionPaths({ kind: 'mute', id: stripPubkyPrefix(mutee) }).map((path) => ownerPathToUrl(muter, path));
  }
}
