import { z } from 'zod';
import { PUBCHI_QUESTION_MAX_LENGTH } from '@/libs/pubchi/limits';

export const PUBCHI_QUESTION_MAX_LENGTH_MESSAGE = 'Questions are limited to 500 characters.';

export const QUERY_FORM_FIELDS = {
  QUESTION: 'question',
} as const;

export const pubchiQueryFormSchema = z.object({
  [QUERY_FORM_FIELDS.QUESTION]: z
    .string()
    .trim()
    .min(1, { message: 'Enter a question.' })
    .max(PUBCHI_QUESTION_MAX_LENGTH, { message: PUBCHI_QUESTION_MAX_LENGTH_MESSAGE }),
});

export type PubchiQueryFormData = z.infer<typeof pubchiQueryFormSchema>;

export const pubchiQueryFormDefaults: PubchiQueryFormData = {
  [QUERY_FORM_FIELDS.QUESTION]: '',
};
