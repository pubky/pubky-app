import { encodeContent, encodeObject, type Post } from 'pubky-social-specs';
import type { TLockContentFile } from '@/application/locks/locks.types';
import { ValidationErrorCode } from '@/libs/error/error.codes';
import { Err } from '@/libs/error/error.factories';
import { ErrorService } from '@/libs/error/error.types';
import { parseArticleContent } from '@/libs/post/articleContent';
import { toStoredPostKind } from '@/pipes/post/post.kind';
import { toSpecsValidationError } from '@/pipes/specs.errors';

// The homeserver detects each file's type from its bytes: real media (image/webp, video/mp4, …) is
// recognized, but JSON is not, so it falls back to `octet-stream`. createContentLock() fails unless our
// declared type matches what the homeserver detected, so the JSON primary must be declared
// `octet-stream`. pubky-app still knows the primary is a post — by convention, it always is.
const POST_CONTENT_TYPE = 'application/octet-stream';

export type TGuardedPrimaryParams = {
  /** A note's text, or an article's `{ title, body }` JSON as the composer builds it. */
  content: string;
  /** The local (Nexus-vocabulary) kind the composer inferred for the locked content. */
  kind: string;
  /** The guarded resources, as `pubky://` URIs on the account the bytes landed on, in slot order. */
  attachmentUris: readonly string[];
};

/**
 * Builds the guarded primary of a content lock: a v1 `Post` encoded by kind alone, since the
 * Locks namespace (`/priv/app.locks/content/`) is no place the data model names. Pure: no IO.
 *
 * A locked article keeps the slot-0 convention inside the lock (its cover, when it has one, is
 * `attachments[0]` and the body's `attachment:{n}` slots count from there), and its envelope is
 * spelled with `cover_image: null` (ADR-0023). Readers parse both this shape and the 0.x one
 * (`GuardedContentParser.parsePost`).
 */
export class GuardedPostBuilder {
  private constructor() {}

  static toPrimary({ content, kind, attachmentUris }: TGuardedPrimaryParams): TLockContentFile {
    const stored = toStoredPostKind(kind);
    if (!stored) {
      throw Err.validation(ValidationErrorCode.INVALID_INPUT, 'Unsupported post kind', {
        service: ErrorService.Local,
        operation: 'GuardedPostBuilder.toPrimary',
        context: { kind },
      });
    }
    try {
      const post: Post = {
        content: stored === 'article' ? this.articleEnvelope(content) : content,
        kind: stored,
        parent: null,
        embed: null,
        attachments: attachmentUris.map((uri) => ({ uri, name: null, alt: null })),
        lock: null,
      };
      return { contentType: POST_CONTENT_TYPE, bytes: encodeObject({ kind: 'post', root: 'private' }, post) };
    } catch (error) {
      throw toSpecsValidationError(error, 'GuardedPostBuilder.toPrimary', { kind: stored });
    }
  }

  private static articleEnvelope(content: string): string {
    const article = parseArticleContent(content);
    if (!article) {
      throw Err.validation(ValidationErrorCode.INVALID_INPUT, 'Article content is not a title and a body', {
        service: ErrorService.Local,
        operation: 'GuardedPostBuilder.toPrimary',
      });
    }
    return encodeContent({ title: article.title, body: article.body, cover_image: null });
  }
}
