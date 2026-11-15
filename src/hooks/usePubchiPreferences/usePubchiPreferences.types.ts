import { z } from 'zod';
import { scanForbiddenPublicState } from '@/libs/pubchi/schemas/forbidden';

const forbiddenMessage = 'That looks like a secret or recovery phrase. Bot state is public — choose something else.';
const safePublicText = z
  .string()
  .trim()
  .refine((value) => scanForbiddenPublicState(value).ok, {
    message: forbiddenMessage,
  });
const topic = z.object({
  label: safePublicText.min(1).max(40),
  weight: z.number().int().min(1).max(5),
});

export const pubchiPreferencesFormSchema = z.object({
  display_name: safePublicText.min(1).max(40),
  language: z.enum(['en', 'es', 'de', 'fr', 'pt']),
  summary_length: z.enum(['short', 'medium', 'long']),
  include_sources: z.boolean(),
  include_disagreement: z.boolean(),
  topics: z.array(topic).max(20),
  excluded_topics: z.array(safePublicText.min(1).max(40)).max(20),
  proactive_enabled: z.boolean(),
  max_suggestions_per_day: z.number().int().min(0).max(10),
  quiet_hours_start: z.number().int().min(0).max(23),
  quiet_hours_end: z.number().int().min(0).max(23),
  follower_history_opt_in: z.boolean(),
});

export type PubchiPreferencesFormData = z.infer<typeof pubchiPreferencesFormSchema>;

export const pubchiPreferencesFormDefaults: PubchiPreferencesFormData = {
  display_name: 'Pubchi',
  language: 'en',
  summary_length: 'short',
  include_sources: true,
  include_disagreement: true,
  topics: [],
  excluded_topics: [],
  proactive_enabled: false,
  max_suggestions_per_day: 1,
  quiet_hours_start: 22,
  quiet_hours_end: 7,
  follower_history_opt_in: false,
};
