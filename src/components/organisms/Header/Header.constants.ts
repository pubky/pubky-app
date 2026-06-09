// Map paths to step numbers and translation keys (onboarding.steps.*)
export const pathToStepConfig: Record<string, { step: number; titleKey: string }> = {
  '/onboarding/human': { step: 1, titleKey: 'createAccount' },
  '/onboarding/install': { step: 2, titleKey: 'identityKeys' },
  '/onboarding/scan': { step: 3, titleKey: 'usePubkyRing' },
  '/onboarding/pubky': { step: 3, titleKey: 'yourPubky' },
  '/onboarding/backup': { step: 4, titleKey: 'backup' },
  '/onboarding/profile': { step: 5, titleKey: 'profile' },
  '/logout': { step: 1, titleKey: 'signedOut' },
};
