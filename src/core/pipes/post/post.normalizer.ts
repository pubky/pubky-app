import { PostResult, PubkyAppPostEmbed, PubkyAppPostKind, PubkyAppPost } from 'pubky-app-specs';
import { Logger } from '@/libs/logger/logger';
import { AppError } from '@/libs/error/error';
import { AuthErrorCode, ClientErrorCode, ValidationErrorCode } from '@/libs/error/error.codes';
import { Err } from '@/libs/error/error.factories';
import { ErrorService } from '@/libs/error/error.types';
import type { TEditPostParams } from '@/controllers/post/post.types';
import { CompositeIdDomain, type Pubky } from '@/models/models.types';
import { buildCompositeIdFromPubkyUri, parseCompositeId } from '@/models/models.utils';
import { PostDetailsModel } from '@/models/post/details/postDetails';
import { PostRelationshipsModel } from '@/models/post/relationships/postRelationships';
import { PubkySpecsSingleton } from '@/pipes/pipes.builder';
import type { PostValidatorData } from '@/pipes/pipes.types';
export class PostNormalizer {
  private constructor() {}

  static postKindToLowerCase(kind: string): string {
    // We will use that one until we fix the pubky-app-specs library
    return kind.toLowerCase();
  }

  /**
   * Maps stored kind string to PubkyAppPostKind enum.
   * DB stores "short"/"long" strings, but PubkyAppPost expects numeric enum values.
   */
  static mapKindToEnum(kind: string): PubkyAppPostKind {
    const normalized = kind.toLowerCase();
    if (normalized === 'long' || normalized === '1') {
      return PubkyAppPostKind.Long;
    }
    return PubkyAppPostKind.Short;
  }

  static async to(post: PostValidatorData, specsPubky: Pubky): Promise<PostResult> {
    try {
      const builder = PubkySpecsSingleton.get(specsPubky);

      // Create embed object if embed URI is provided
      let embedObject: PubkyAppPostEmbed | null = null;
      if (post.embed) {
        const embeddedPostId = buildCompositeIdFromPubkyUri({
          uri: post.embed,
          domain: CompositeIdDomain.POSTS,
        });
        if (embeddedPostId) {
          const embeddedPost = await PostDetailsModel.findById(embeddedPostId);
          if (embeddedPost) {
            embedObject = new PubkyAppPostEmbed(post.embed, embeddedPost.kind as unknown as PubkyAppPostKind);
          }
        }
      }

      let attachments: string[] | null = null;

      if (post.attachments) {
        attachments = post.attachments.map((attachment) => attachment.fileResult.meta.url);
      }

      return builder.createPost(post.content, post.kind, post.parentUri ?? null, embedObject, attachments);
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }
      throw Err.validation(ValidationErrorCode.INVALID_INPUT, error as string, {
        service: ErrorService.PubkyAppSpecs,
        operation: 'createPost',
        context: { post, specsPubky },
      });
    }
  }

  static async toEdit({
    compositePostId,
    content,
    currentUserPubky,
  }: TEditPostParams & { currentUserPubky: Pubky }): Promise<PostResult> {
    const { pubky: authorId, id: postId } = parseCompositeId(compositePostId);

    if (authorId !== currentUserPubky) {
      throw Err.auth(AuthErrorCode.FORBIDDEN, 'Current user is not the author of this post', {
        service: ErrorService.Local,
        operation: 'toEdit',
        context: { postId, currentUserPubky },
      });
    }

    const builder = PubkySpecsSingleton.get(authorId);

    const postDetails = await PostDetailsModel.findById(compositePostId);
    if (!postDetails) {
      throw Err.client(ClientErrorCode.NOT_FOUND, 'Post not found', {
        service: ErrorService.Local,
        operation: 'toEdit',
        context: { postId: compositePostId },
      });
    }

    const postRelationships = await PostRelationshipsModel.findById(compositePostId);

    // Reconstruct the original PubkyAppPost from stored data
    let embedObject: PubkyAppPostEmbed | undefined;
    if (postRelationships?.reposted) {
      // Get the embedded post's kind if available
      const embeddedPostId = buildCompositeIdFromPubkyUri({
        uri: postRelationships.reposted,
        domain: CompositeIdDomain.POSTS,
      });
      if (embeddedPostId) {
        const embeddedPost = await PostDetailsModel.findById(embeddedPostId);
        if (embeddedPost) {
          embedObject = new PubkyAppPostEmbed(postRelationships.reposted, this.mapKindToEnum(embeddedPost.kind));
        }
      }
    }

    const originalPost = new PubkyAppPost(
      postDetails.content,
      this.mapKindToEnum(postDetails.kind),
      postRelationships?.replied ?? null,
      embedObject ?? null,
      postDetails.attachments,
    );

    const result = builder.editPost(originalPost, postId, content);

    Logger.debug('Post validated', { result });

    return result;
  }
}
