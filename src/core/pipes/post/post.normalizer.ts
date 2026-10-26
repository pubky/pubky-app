import {
  type Attachment,
  buildPost,
  type BuiltPost,
  decodeContent,
  editPost,
  encodeContent,
  type NewPost,
  type Post,
  type UrlArg,
} from 'pubky-social-specs';
import { AppError } from '@/libs/error/error';
import { ValidationErrorCode } from '@/libs/error/error.codes';
import { Err } from '@/libs/error/error.factories';
import { ErrorService } from '@/libs/error/error.types';
import { parseArticleContent } from '@/libs/post/articleContent';
import type { Pubky } from '@/models/models.types';
import type { CollectionContentInput } from '@/models/post/collection/collectionPost.types';
import type { PostValidatorData, TPostEdit } from '@/pipes/pipes.types';
import { CollectionPostContent } from '@/pipes/post/post.collection';

/** The newest stored version of a post: where it is, and what it holds. */
export type TPostHead = {
  url: UrlArg<'post'>;
  post: Post;
};

type TToEditParams = {
  owner: Pubky;
  head: TPostHead;
  edit: TPostEdit;
};

export class PostNormalizer {
  private constructor() {}

  static toCollection(collection: CollectionContentInput, specsPubky: Pubky): BuiltPost {
    return this.build(
      () => buildPost(specsPubky, CollectionPostContent.toNewInput(CollectionPostContent.normalize(collection))),
      'buildPost',
      { specsPubky, itemCount: collection.items?.length ?? 0 },
    );
  }

  static to(post: PostValidatorData, specsPubky: Pubky): BuiltPost {
    // The uploads in the order given: an article's cover first, then its body files
    const attachments = (post.attachments ?? []).map((attachment) => ({
      uri: attachment.media.url,
      name: attachment.name,
    }));
    const threaded = {
      parent: post.parentUri ?? null,
      embed: post.embed ?? null,
      attachments,
      lock: post.lock ?? null,
    };

    return this.build(
      () => {
        if (post.kind === 'article') {
          const article = this.parseArticle(post.content);
          return buildPost(specsPubky, { kind: 'article', title: article.title, body: article.body, ...threaded });
        }
        if (post.kind === 'collection') {
          throw Err.validation(ValidationErrorCode.INVALID_INPUT, 'A collection is created with toCollection', {
            service: ErrorService.Local,
            operation: 'buildPost',
          });
        }
        const input: NewPost = { kind: post.kind, content: post.content, ...threaded };
        return buildPost(specsPubky, input);
      },
      'buildPost',
      { specsPubky },
    );
  }

  /**
   * The next version of a post: its newest stored version with `edit` applied. Everything the
   * edit leaves out is carried over as stored, the lock, the alt text of kept attachments and the
   * members another client added included.
   */
  static toEdit({ owner, head, edit }: TToEditParams): BuiltPost {
    return this.build(
      () => {
        const post: Post = { ...head.post };
        if (edit.kind !== undefined) post.kind = edit.kind;
        if (edit.attachmentUris !== undefined) {
          post.attachments = this.nextAttachments(
            head.post.attachments,
            edit.attachmentUris ?? [],
            edit.attachmentNames,
          );
        }
        const envelope = decodeContent(head.post);
        if (edit.collection !== undefined) {
          if (envelope?.kind !== 'collection') throw this.notKind('collection');
          post.content = encodeContent(CollectionPostContent.toStored(envelope.content, edit.collection));
        } else if (edit.content !== undefined) {
          if (envelope?.kind === 'article') {
            const article = this.parseArticle(edit.content);
            post.content = encodeContent({ ...envelope.content, title: article.title, body: article.body });
          } else if (envelope === null) {
            post.content = edit.content;
          } else {
            throw this.notKind('note');
          }
        }
        return editPost(owner, head.url, post);
      },
      'editPost',
      { owner, headUrl: head.url },
    );
  }

  /** The attachments in `uris` order: a kept one keeps its stored object, a new one gets its name. */
  private static nextAttachments(
    stored: Attachment[],
    uris: string[],
    names: Record<string, string> | undefined,
  ): Attachment[] {
    const byUri = new Map(stored.map((attachment) => [attachment.uri, attachment]));
    return uris.map((uri) => byUri.get(uri) ?? { uri, alt: null, name: names?.[uri] ?? null });
  }

  private static parseArticle(content: string): { title: string; body: string } {
    const article = parseArticleContent(content);
    if (!article) {
      throw Err.validation(ValidationErrorCode.INVALID_INPUT, 'Article content is not a title and a body', {
        service: ErrorService.Local,
        operation: 'parseArticle',
      });
    }
    return article;
  }

  private static notKind(kind: string): AppError {
    return Err.validation(ValidationErrorCode.INVALID_INPUT, `The stored post is not a ${kind}`, {
      service: ErrorService.Local,
      operation: 'toEdit',
    });
  }

  /** Runs a package call, turning its refusal into a validation error carrying the package's words. */
  private static build(run: () => BuiltPost, operation: string, context: Record<string, unknown>): BuiltPost {
    try {
      return run();
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw Err.validation(ValidationErrorCode.INVALID_INPUT, error instanceof Error ? error.message : String(error), {
        service: ErrorService.PubkyAppSpecs,
        operation,
        context,
        cause: error,
      });
    }
  }
}
