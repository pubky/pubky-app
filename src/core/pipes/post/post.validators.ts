import { PostController } from '@/controllers/post/post';
import { ClientErrorCode } from '@/libs/error/error.codes';
import { Err } from '@/libs/error/error.factories';
import { ErrorService } from '@/libs/error/error.types';
import { isPostDeleted } from '@/libs/utils/utils';

export type TValidatePostIdParams = {
  postId: string;
  message: string;
};

export class PostValidators {
  constructor() {}

  static async validatePostId({ postId, message }: TValidatePostIdParams): Promise<string> {
    const parentPost = await PostController.getDetails({ compositeId: postId });
    // Treat tombstones (`content === '[DELETED]'`) as not-found. Pre-tombstone
    // refactor the hard-delete branch fully removed the row so `!parentPost`
    // caught this; now the row sticks around as a tombstone and we need an
    // explicit content check or replies / repost validation would silently
    // pass against a deleted parent.
    if (!parentPost || isPostDeleted(parentPost.content)) {
      throw Err.client(ClientErrorCode.NOT_FOUND, `${message} not found`, {
        service: ErrorService.Local,
        operation: 'validatePostId',
        context: { postId },
      });
    }
    return parentPost.uri;
  }
}
