export const POST_INPUT_VARIANT = {
  REPLY: 'reply',
  POST: 'post',
  REPOST: 'repost',
  EDIT: 'edit',
} as const;

export const POST_INPUT_BUTTON_LABEL = {
  [POST_INPUT_VARIANT.REPLY]: 'Reply',
  [POST_INPUT_VARIANT.POST]: 'Post',
  [POST_INPUT_VARIANT.REPOST]: 'Repost',
  [POST_INPUT_VARIANT.EDIT]: 'Edit',
} as const;

export const POST_INPUT_PLACEHOLDER = {
  [POST_INPUT_VARIANT.REPLY]: 'Write a reply...',
  [POST_INPUT_VARIANT.POST]: "What's on your mind?",
  [POST_INPUT_VARIANT.REPOST]: 'Optional comment',
  [POST_INPUT_VARIANT.EDIT]: 'Edit post',
} as const;
