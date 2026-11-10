import { z } from 'zod';
import { parseAddContentInput } from './useAddContentForm.utils';

export const ADD_CONTENT_FORM_FIELDS = {
  POST_URL: 'postUrl',
} as const;

export const addContentFormSchema = z.object({
  [ADD_CONTENT_FORM_FIELDS.POST_URL]: z
    .string()
    .trim()
    .min(1, { message: 'Paste a post or link URL.' })
    .superRefine((value, ctx) => {
      const input = parseAddContentInput(value);
      if (input.type === 'invalid') ctx.addIssue({ code: 'custom', message: input.message });
    }),
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
