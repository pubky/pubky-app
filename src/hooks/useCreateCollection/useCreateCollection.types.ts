import { z } from 'zod';
import { COLLECTION_LAYOUT, DEFAULT_COLLECTION_LAYOUT } from '@/config/collections';
import { COLLECTION_DESCRIPTION_MAX_CHARACTER_LENGTH, COLLECTION_NAME_MAX_CHARACTER_LENGTH } from '@/config/posts';

export const CREATE_COLLECTION_FORM_FIELDS = {
  NAME: 'name',
  DESCRIPTION: 'description',
  LAYOUT: 'layout',
} as const;

/** Schema for the "create collection" form. */
export const createCollectionFormSchema = z.object({
  [CREATE_COLLECTION_FORM_FIELDS.NAME]: z
    .string()
    .max(COLLECTION_NAME_MAX_CHARACTER_LENGTH)
    .refine((value) => value.trim().length > 0, { message: 'Collection title is required.' }),
  [CREATE_COLLECTION_FORM_FIELDS.DESCRIPTION]: z.string().max(COLLECTION_DESCRIPTION_MAX_CHARACTER_LENGTH),
  [CREATE_COLLECTION_FORM_FIELDS.LAYOUT]: z.enum([
    COLLECTION_LAYOUT.GRID,
    COLLECTION_LAYOUT.LIST,
    COLLECTION_LAYOUT.VISUAL,
  ]),
});

export type CreateCollectionFormData = z.infer<typeof createCollectionFormSchema>;

/** Default values for the create-collection form. */
export const createCollectionFormDefaults: CreateCollectionFormData = {
  [CREATE_COLLECTION_FORM_FIELDS.NAME]: '',
  [CREATE_COLLECTION_FORM_FIELDS.DESCRIPTION]: '',
  [CREATE_COLLECTION_FORM_FIELDS.LAYOUT]: DEFAULT_COLLECTION_LAYOUT,
};
