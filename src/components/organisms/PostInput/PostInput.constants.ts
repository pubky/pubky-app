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
