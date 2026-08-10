// Map paths to step numbers and header titles
export const pathToStepConfig: Record<string, { step: number; title: string }> = {
  '/onboarding/human': { step: 1, title: 'Create account' },
  '/onboarding/install': { step: 2, title: 'Identity keys' },
  '/onboarding/scan': { step: 3, title: 'Use Pubky Ring' },
  '/onboarding/pubky': { step: 3, title: 'Your pubky' },
  '/onboarding/backup': { step: 4, title: 'Backup' },
  '/onboarding/profile': { step: 5, title: 'Profile' },
  '/logout': { step: 1, title: 'Signed out' },
};
