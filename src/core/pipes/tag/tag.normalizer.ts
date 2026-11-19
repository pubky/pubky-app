import { buildTag, buildUri, type Built, type Tag } from 'pubky-social-specs';
import { TagKind } from '@/application/tag/tag.types';
import type { TTagEventParams, TTagFromResponse } from '@/controllers/tag/tag.types';
import type { Pubky } from '@/models/models.types';
import { parseCompositeId } from '@/models/models.utils';
import { toSpecsValidationError } from '@/pipes/specs.errors';
import type { NexusTaggersWire, NexusTagWire } from '@/services/nexus/nexus.types';

export class TagNormalizer {
  private constructor() {}

  /**
   * A tag, or a taggers page, as the app holds it, from the one Nexus serves. `/v0` served
   * `relationship`; `/v1` does not, and `tag_uri` (the viewer's own tag file, `null` when they have
   * not tagged the label) says the same, so a missing `relationship` is derived from it. Right only
   * for a response fetched with the viewer on the request: without one `tag_uri` is `null`, which
   * reads as `false`, the right answer for a guest. A `relationship` Nexus did send is kept as sent.
   */
  static fromNexus<T extends NexusTagWire | NexusTaggersWire>(tag: T): T & { relationship: boolean } {
    return { ...tag, relationship: tag.relationship ?? tag.tag_uri != null };
  }

  /**
   * The viewer's tag on a post or a user, as `pubky-social-specs` stores it. The target is the
   * post reference or the profile URL, never the bare key: that is what the migration respells a
   * 0.x user tag to, so the app's user tags and the migrated ones share one target. The label is
   * the stored one (trimmed, ASCII-lowercased), which the tag id hashes with the target.
   */
  static from({ taggedKind, taggedId, label, taggerId }: TTagEventParams): TTagFromResponse {
    let uri: string;
    try {
      if (taggedKind === TagKind.POST) {
        const { pubky, id: postId } = parseCompositeId(taggedId);
        uri = buildUri(pubky, 'post', postId);
      } else {
        uri = buildUri(taggedId, 'user');
      }
    } catch (error) {
      throw toSpecsValidationError(error, 'createTagFromParams', { taggedKind, taggedId, label, taggerId });
    }
    const { object, url, body } = TagNormalizer.to(uri, label, taggerId);

    return { taggerId, taggedId, label: object.label, taggedKind, tagUrl: url, tagBody: body };
  }

  /**
   * A viewer may delete only a tag file under their own `/pub/`: an app folder of one or two segments
   * (`pubky.app`, `mapky`, `social/v1`, ...) followed by `tags/<id>`. Anything else is treated as a missing address.
   */
  static toOwnTagUri(tagUri: string | null | undefined, taggerId: Pubky): string | undefined {
    const prefix = `pubky://${taggerId}/pub/`;
    if (!tagUri?.startsWith(prefix)) return undefined;
    const segments = tagUri.slice(prefix.length).split('/');
    const isTagFile =
      // pubky.app keeps its tags directly in `pubky.app/tags/`, so only other apps may use a two-segment folder.
      (segments.length === 3 || (segments.length === 4 && segments[0] !== 'pubky.app')) &&
      segments.at(-2) === 'tags' &&
      segments.every((segment) => /^[A-Za-z0-9._-]+$/.test(segment) && segment !== '.' && segment !== '..');
    return isTagFile ? tagUri : undefined;
  }

  /** The tag `pubky` puts on `uri`: where it goes, the stored object and the bytes to PUT. */
  static to(uri: string, label: string, pubky: Pubky): Built<Tag> {
    try {
      return buildTag(pubky, uri, label);
    } catch (error) {
      throw toSpecsValidationError(error, 'buildTag', { uri, label, pubky });
    }
  }
}
