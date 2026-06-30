import type { PostDetailsModel } from '@/models/post/details/postDetails';

export interface PostContentLockProps {
  /** The lock post's raw `content` field (a JSON string). */
  content: string;
  /** The post's top-level `lock` URL (points at the public `lock.json`). */
  lock: string | null | undefined;
  /** The post's attachments — image/video/file media for the teaser body. */
  attachments?: PostDetailsModel['attachments'];
  className?: string;
  textClassName?: string;
}
