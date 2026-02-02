import type { Dispatch, SetStateAction } from 'react';

export interface UsePostReplyOptions {
  postId: string;
  onSuccess?: (createdPostId: string) => void;
}

export interface UsePostPostOptions {
  onSuccess?: (createdPostId: string) => void;
}

export interface UsePostRepostOptions {
  originalPostId: string;
  onSuccess?: (createdPostId: string) => void;
}

export interface UsePostEditOptions {
  editPostId: string;
  onSuccess?: (createdPostId: string) => void;
}

export interface UsePostReturn {
  content: string;
  setContent: Dispatch<SetStateAction<string>>;
  tags: string[];
  setTags: Dispatch<SetStateAction<string[]>>;
  attachments: File[];
  setAttachments: Dispatch<SetStateAction<File[]>>;
  isArticle: boolean;
  setIsArticle: Dispatch<SetStateAction<boolean>>;
  articleTitle: string;
  setArticleTitle: Dispatch<SetStateAction<string>>;
  reply: (options: UsePostReplyOptions) => Promise<void>;
  post: (options: UsePostPostOptions) => Promise<void>;
  repost: (options: UsePostRepostOptions) => Promise<void>;
  edit: (options: UsePostEditOptions) => Promise<void>;
  isSubmitting: boolean;
}
