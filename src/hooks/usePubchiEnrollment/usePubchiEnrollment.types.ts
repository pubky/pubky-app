import { z } from 'zod';
import { scanForbiddenPublicState } from '@/libs/pubchi/schemas/forbidden';

export const ENROLL_FORM_FIELDS = {
  DISPLAY_NAME: 'displayName',
} as const;

export const enrollPubchiFormSchema = z.object({
  [ENROLL_FORM_FIELDS.DISPLAY_NAME]: z
    .string()
    .trim()
    .min(1, 'Enter a name.')
    .max(40, 'Use 40 characters or fewer.')
    .refine((value) => scanForbiddenPublicState(value).ok, {
      message: 'That looks like a secret or recovery phrase. Bot state is public — choose something else.',
    }),
});

export type EnrollPubchiFormData = z.infer<typeof enrollPubchiFormSchema>;

export const enrollPubchiFormDefaults: EnrollPubchiFormData = {
  [ENROLL_FORM_FIELDS.DISPLAY_NAME]: 'Pubchi',
};

export const BACKUP_FORM_FIELDS = {
  WORD_ONE: 'wordOne',
  WORD_TWO: 'wordTwo',
  WORD_THREE: 'wordThree',
} as const;

export const backupConfirmationSchema = z.object({
  wordOne: z.string().trim().min(1),
  wordTwo: z.string().trim().min(1),
  wordThree: z.string().trim().min(1),
});

export type BackupConfirmationData = z.infer<typeof backupConfirmationSchema>;

export const backupConfirmationDefaults: BackupConfirmationData = {
  wordOne: '',
  wordTwo: '',
  wordThree: '',
};
