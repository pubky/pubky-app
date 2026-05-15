import { PostController } from '@/controllers/post/post';
import { ClientErrorCode } from '@/libs/error/error.codes';
import { Err } from '@/libs/error/error.factories';
import { ErrorService } from '@/libs/error/error.types';

export type TValidatePostIdParams = {
  postId: string;
  message: string;
};

export class PostValidators {
  constructor() {}

  static async validatePostId({ postId, message }: TValidatePostIdParams): Promise<string> {
    const parentPost = await PostController.getDetails({ compositeId: postId });
    if (!parentPost) {
      throw Err.client(ClientErrorCode.NOT_FOUND, `${message} not found`, {
        service: ErrorService.Local,
        operation: 'validatePostId',
        context: { postId },
      });
    }
    return parentPost.uri;
  }
}
