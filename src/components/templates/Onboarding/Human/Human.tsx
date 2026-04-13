'use client';

import * as Molecules from '@/molecules';
import * as Organisms from '@/organisms';
import * as Core from '@/core';
import * as Libs from '@/libs';
import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ONBOARDING_ROUTES } from '@/app';

enum States {
  Selection = 'selection',
  PhoneInput = 'phoneInput',
  PhoneCode = 'phoneCode',
  Payment = 'payment',
  InviteCode = 'inviteCode',
}

export function Human() {
  const [state, setState] = useState<States>(States.Selection);
  const [phoneNumber, setPhoneNumber] = useState<string>('');
  const router = useRouter();
  const searchParams = useSearchParams();
  const inviteCodeFromUrl = Libs.formatInviteCode(searchParams.get('inviteCode') ?? '');
  const hasInviteCodeFromUrl = inviteCodeFromUrl.length === 14;

  useEffect(() => {
    if (hasInviteCodeFromUrl) {
      const { setInviteCode } = Core.useOnboardingStore.getState();
      setInviteCode(inviteCodeFromUrl);
      router.push(ONBOARDING_ROUTES.INSTALL);
    } else {
      Core.useOnboardingStore.getState().reset();
    }
  }, [hasInviteCodeFromUrl, inviteCodeFromUrl, router]);

  // After payment/SMS verification, save the invite code and redirect to install page.
  // Signup to the homeserver happens later, after the user creates their keypair
  // (browser keys on /onboarding/pubky or Pubky Ring on /onboarding/scan).
  function onSuccess(inviteCode: string) {
    Core.useOnboardingStore.getState().setInviteCode(inviteCode);
    router.push(ONBOARDING_ROUTES.INSTALL);
  }
  return (
    <Molecules.OnboardingLayout testId="human-content">
      {state === States.Selection && (
        <Organisms.HumanSelection
          onClick={(card) => {
            if (card === 'sms') {
              setState(States.PhoneInput);
            } else if (card === 'payment') {
              setState(States.Payment);
            }
          }}
          onInviteCodeClick={() => setState(States.InviteCode)}
          onDevMode={async (variant) => {
            if (variant === 'inviteCode') {
              setState(States.InviteCode);
            } else if (variant === 'skip') {
              try {
                const code = await Core.AuthController.generateSignupToken();
                await onSuccess(code);
              } catch (error) {
                Libs.Logger.error('[Human] Dev skip failed (generate token or signup):', error);
              }
            }
          }}
        />
      )}
      {state === States.PhoneInput && (
        <Organisms.HumanPhoneInput
          initialPhoneNumber={phoneNumber}
          onBack={() => setState(States.Selection)}
          onCodeSent={(phoneNum) => {
            setPhoneNumber(phoneNum);
            setState(States.PhoneCode);
          }}
        />
      )}
      {state === States.PhoneCode && (
        <Organisms.HumanPhoneCode
          phoneNumber={phoneNumber!}
          onBack={() => setState(States.PhoneInput)}
          onSuccess={onSuccess}
        />
      )}
      {state === States.Payment && (
        <Organisms.HumanLightningPayment onBack={() => setState(States.Selection)} onSuccess={onSuccess} />
      )}
      {state === States.InviteCode && (
        <Organisms.HumanInviteCode onBack={() => setState(States.Selection)} onSuccess={onSuccess} />
      )}
    </Molecules.OnboardingLayout>
  );
}
