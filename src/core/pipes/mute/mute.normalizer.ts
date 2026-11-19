import { buildMute, type Built, deletionPaths, type Mute, type Owner, toUrl } from 'pubky-social-specs';
import type { TMuteParams } from '@/controllers/mute/mute.types';
import { stripPubkyPrefix } from '@/libs/utils/utils';
import { toSpecsValidationError } from '@/pipes/specs.errors';

export class MuteNormalizer {
  private constructor() {}

  /** The mute as `pubky-social-specs` stores it under the muter's private root. */
  static to({ muter, mutee }: TMuteParams): Built<Mute, Owner, 'mute'> {
    try {
      // The builder takes a bare 52-character z-base32 key, so any `pubky` or `pk:` prefix goes first
      return buildMute(muter, stripPubkyPrefix(mutee));
    } catch (error) {
      throw toSpecsValidationError(error, 'buildMute', { muter, mutee });
    }
  }

  /** Every copy an unmute deletes: the 0.x mute first, then the v1 one. */
  static toDeleteUrls({ muter, mutee }: TMuteParams): string[] {
    try {
      return deletionPaths({ kind: 'mute', id: stripPubkyPrefix(mutee) }).map((path) => toUrl(muter, path));
    } catch (error) {
      throw toSpecsValidationError(error, 'muteDeletionPaths', { muter, mutee });
    }
  }
}
