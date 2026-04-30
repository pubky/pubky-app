import type { PostDetailsModelSchema } from '@/models/post/details/postDetails.schema';
import type { UserDetailsModelSchema } from '@/models/user/details/userDetails.schema';
export type EnrichedPostDetails = PostDetailsModelSchema & {
  is_moderated: boolean;
  is_blurred: boolean;
};

export type EnrichedUserDetails = UserDetailsModelSchema & {
  is_moderated: boolean;
  is_blurred: boolean;
};
