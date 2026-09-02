// Map paths to step numbers and header titles.
// 4-step model per the onboarding design: account (1), keys (2), profile (3), experience (4).
export const pathToStepConfig: Record<string, { step: number; title: string }> = {
  '/onboarding/human': { step: 1, title: 'Create account' },
  '/onboarding/install': { step: 2, title: 'Identity keys' },
  '/onboarding/scan': { step: 2, title: 'Use Pubky Ring' },
  '/onboarding/pubky': { step: 2, title: 'Your pubky' },
  '/onboarding/backup': { step: 2, title: 'Backup' },
  '/onboarding/profile': { step: 3, title: 'Profile' },
  '/onboarding/tags': { step: 4, title: 'Experience' },
  '/logout': { step: 1, title: 'Signed out' },
};
