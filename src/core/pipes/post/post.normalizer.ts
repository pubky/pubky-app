import {
  type Attachment,
  buildPost,
  type BuiltPost,
  type CollectionContent as StoredCollectionContent,
  decodeContent,
  editPost,
  encodeContent,
  type NewPost,
  type Post,
  tryDecodeContent,
  type UrlArg,
} from 'pubky-social-specs';
import { AppError } from '@/libs/error/error';
import { ValidationErrorCode } from '@/libs/error/error.codes';
import { Err } from '@/libs/error/error.factories';
import { ErrorService } from '@/libs/error/error.types';
import { parseArticleContent } from '@/libs/post/articleContent';
import type { Pubky } from '@/models/models.types';
import type { CollectionContentInput } from '@/models/post/collection/collectionPost.types';
import type { PostDetailsModelSchema } from '@/models/post/details/postDetails.schema';
import type { PostValidatorData, TPostEdit } from '@/pipes/pipes.types';
import { CollectionPostContent } from '@/pipes/post/post.collection';
import { toLocalPostKind } from '@/pipes/post/post.kind';
import { toSpecsValidationError } from '@/pipes/specs.errors';

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

type TToLocalEditParams = {
  /** The cached row the edit starts from. */
  row: Pick<PostDetailsModelSchema, 'content' | 'attachments' | 'kind'>;
  edit: TPostEdit;
};

/** What `LocalPostService.edit` takes: the edit projected onto the cached row. */
export type TLocalPostEdit = {
  content: string;
  /** `undefined` leaves the column untouched; `null` clears it. */
  attachments?: string[] | null;
  /** `undefined` leaves the column untouched. */
  kind?: string;
};

/** A stored collection envelope with nothing in it, for a cached row whose content is not one. */
const EMPTY_STORED_COLLECTION: StoredCollectionContent = {
  name: '',
  description: null,
  items: [],
  cover_image: null,
  layout: null,
};

export class PostNormalizer {
  private constructor() {}

  /** The first version of a collection: `buildPost` spells its envelope. */
  static toCollection(collection: CollectionContentInput, specsPubky: Pubky): BuiltPost {
    return this.build(
      () => buildPost(specsPubky, CollectionPostContent.toNewInput(CollectionPostContent.normalize(collection))),
      'buildPost',
      { specsPubky, itemCount: collection.items?.length ?? 0 },
    );
  }

  /**
   * The first version of a note or an article. An article's cover goes in the envelope's
   * `cover_image` and its attachments hold the body's inline media only, in slot order, so
   * `attachment:{n}` indexes `attachments` directly (ADR-0023, ADR-0027).
   */
  static to(post: PostValidatorData, specsPubky: Pubky): BuiltPost {
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
          return buildPost(specsPubky, {
            kind: 'article',
            title: article.title,
            body: article.body,
            cover_image: post.coverImage?.media.url ?? null,
            ...threaded,
          });
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
      { specsPubky, kind: post.kind },
    );
  }

  /**
   * The next version of a post: its newest stored version with `edit` applied. Everything the
   * edit leaves out is carried over as stored: the lock, the alt text of kept attachments, an
   * article's cover, a collection's item notes and the members another client added.
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
        } else if (envelope?.kind === 'article') {
          const article = edit.content === undefined ? envelope.content : this.parseArticle(edit.content);
          post.content = encodeContent({
            ...envelope.content,
            title: article.title,
            body: article.body,
            cover_image: edit.coverImage === undefined ? envelope.content.cover_image : edit.coverImage,
          });
        } else if (edit.content !== undefined) {
          if (envelope !== null) throw this.notKind('note');
          post.content = edit.content;
        }
        return editPost(owner, head.url, post);
      },
      'editPost',
      { owner, headUrl: head.url },
    );
  }

  /**
   * The edit projected onto the cached row, for the optimistic local write that lands before the
   * head is read (ADR-0027). Pure and best-effort: the row converges to the version that is PUT.
   */
  static toLocalEdit({ row, edit }: TToLocalEditParams): TLocalPostEdit {
    const local: TLocalPostEdit = { content: row.content };
    if (edit.kind !== undefined) local.kind = toLocalPostKind(edit.kind);
    if (edit.attachmentUris !== undefined) {
      local.attachments = edit.attachmentUris && edit.attachmentUris.length > 0 ? edit.attachmentUris : null;
    }
    if (edit.collection !== undefined) {
      const stored = tryDecodeContent({ kind: 'collection', content: row.content });
      const envelope =
        stored.ok && stored.value?.kind === 'collection' ? stored.value.content : EMPTY_STORED_COLLECTION;
      local.content = encodeContent(CollectionPostContent.toStored(envelope, edit.collection));
    } else if (row.kind === 'long' && (edit.content !== undefined || edit.coverImage !== undefined)) {
      const stored = parseArticleContent(row.content);
      const article = edit.content === undefined ? stored : this.parseArticle(edit.content);
      local.content = encodeContent({
        title: article?.title ?? '',
        body: article?.body ?? '',
        cover_image: edit.coverImage === undefined ? (stored?.cover_image ?? null) : edit.coverImage,
      });
    } else if (edit.content !== undefined) {
      local.content = edit.content;
    }
    return local;
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

  /**
   * Runs a package call, turning its refusal into a validation error carrying the package's words
   * and, for a rule of the data model, its structured `code`, `field` and `limit`.
   */
  private static build(run: () => BuiltPost, operation: string, context: Record<string, unknown>): BuiltPost {
    try {
      return run();
    } catch (error) {
      throw toSpecsValidationError(error, operation, context);
    }
  }
}
