import { z } from 'zod';
import { parsePostReference } from '@/pipes/post/post.reference';

export const ADD_CONTENT_FORM_FIELDS = {
  POST_URL: 'postUrl',
} as const;

type AddContentTranslator = (key: string) => string;

export const addContentFormSchema = (t: AddContentTranslator) =>
  z.object({
    [ADD_CONTENT_FORM_FIELDS.POST_URL]: z
      .string()
      .trim()
      .min(1, { message: t('errors.required') })
      .refine((value) => parsePostReference(value) !== null, { message: t('errors.invalid') }),
  });

export type AddContentFormData = z.infer<ReturnType<typeof addContentFormSchema>>;

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
