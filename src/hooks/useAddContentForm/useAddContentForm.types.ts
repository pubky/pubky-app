import { z } from 'zod';
import { parsePostReference } from '@/pipes/post/post.reference';

export const ADD_CONTENT_FORM_FIELDS = {
  POST_URL: 'postUrl',
} as const;

export const addContentFormSchema = z.object({
  [ADD_CONTENT_FORM_FIELDS.POST_URL]: z
    .string()
    .trim()
    .min(1, { message: 'Paste a post URL.' })
    .refine((value) => parsePostReference(value) !== null, { message: 'Enter a valid post URL.' }),
});

export type AddContentFormData = z.infer<typeof addContentFormSchema>;

export const addContentFormDefaults: AddContentFormData = {
  [ADD_CONTENT_FORM_FIELDS.POST_URL]: '',
};

export type AddContentTarget =
  | {
      type: 'bookmarks';
    }
  | {
      type: 'collection';
      collectionId: string;
    };
