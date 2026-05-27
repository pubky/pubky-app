'use client';

import { useEffect, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { formatInviteCode } from '@/libs/utils/utils';
import { InstallCard, InstallFooter, InstallHeader, InstallNavigation } from '@/molecules/Install/Install';
import { OnboardingLayout } from '@/molecules/OnboardingLayout/OnboardingLayout';
import { useToast } from '@/molecules/Toaster/use-toast';
import { useOnboardingStore } from '@/stores/onboarding/onboarding.store';

export function Install() {
  const searchParams = useSearchParams();
  const t = useTranslations('onboarding.install');
  const { toast } = useToast();
  const hasInitialisedFromUrlRef = useRef(false);
  const inviteCodeFromUrl = formatInviteCode(searchParams.get('inviteCode') ?? '');
  const hasInviteCodeFromUrl = inviteCodeFromUrl.length === 14;

  useEffect(() => {
    if (hasInitialisedFromUrlRef.current || !hasInviteCodeFromUrl) {
      return;
    }

    hasInitialisedFromUrlRef.current = true;

    useOnboardingStore.getState().setInviteCode(inviteCodeFromUrl);
    toast({
      title: t('inviteCodeApplied', { code: inviteCodeFromUrl }),
    });
  }, [hasInviteCodeFromUrl, inviteCodeFromUrl, t, toast]);

  return (
    <OnboardingLayout testId="install-content" navigation={<InstallNavigation />}>
      <InstallHeader />
      <InstallCard />
      <InstallFooter />
    </OnboardingLayout>
  );
}
