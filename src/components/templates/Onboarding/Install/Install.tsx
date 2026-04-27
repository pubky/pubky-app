'use client';

import { useEffect, useRef } from 'react';
import { useSearchParams } from 'next/navigation';

import * as Core from '@/core';
import * as Libs from '@/libs';
import * as Molecules from '@/molecules';

export function Install() {
  const searchParams = useSearchParams();
  const { toast } = Molecules.useToast();
  const hasInitialisedFromUrlRef = useRef(false);
  const inviteCodeFromUrl = Libs.formatInviteCode(searchParams.get('inviteCode') ?? '');
  const hasInviteCodeFromUrl = inviteCodeFromUrl.length === 14;

  useEffect(() => {
    if (hasInitialisedFromUrlRef.current || !hasInviteCodeFromUrl) {
      return;
    }

    hasInitialisedFromUrlRef.current = true;

    Core.useOnboardingStore.getState().setInviteCode(inviteCodeFromUrl);
    toast({
      title: 'Invite code applied',
      description: `Your invite code ${inviteCodeFromUrl} has been applied.`,
    });
  }, [hasInviteCodeFromUrl, inviteCodeFromUrl, toast]);

  return (
    <Molecules.OnboardingLayout testId="install-content" navigation={<Molecules.InstallNavigation />}>
      <Molecules.InstallHeader />
      <Molecules.InstallCard />
      <Molecules.InstallFooter />
    </Molecules.OnboardingLayout>
  );
}
