'use client';

import { useRouter } from 'next/navigation';

import * as Molecules from '@/molecules';
import * as Organisms from '@/organisms';
import * as Atoms from '@/atoms';
import * as App from '@/app';

export const HomeserverHeader = () => {
  return (
    <Atoms.PageHeader>
      <Molecules.PageTitle size="large">
        Choose <span className="text-brand">homeserver.</span>
      </Molecules.PageTitle>
      <Atoms.PageSubtitle>Enter your invite code to access the Pubky homeserver. </Atoms.PageSubtitle>
    </Atoms.PageHeader>
  );
};

export const HomeserverFooter = () => {
  return (
    <Atoms.FooterLinks>
      By creating an account on the Pubky homeserver, you agree to the <Organisms.DialogTerms />,{' '}
      <Organisms.DialogPrivacy />, and you confirm that you are <Organisms.DialogAge />
    </Atoms.FooterLinks>
  );
};

export const HomeserverNavigation = ({
  continueButtonDisabled,
  onHandleContinueButton,
  continueText,
}: {
  continueButtonDisabled: boolean;
  onHandleContinueButton: () => void;
  continueText: string;
}) => {
  const router = useRouter();

  const onHandleBackButton = () => {
    router.push(App.ONBOARDING_ROUTES.BACKUP);
  };

  return (
    <Molecules.ButtonsNavigation
      id="homeserver-navigation"
      onHandleBackButton={onHandleBackButton}
      onHandleContinueButton={onHandleContinueButton}
      continueButtonDisabled={continueButtonDisabled}
      continueText={continueText}
    />
  );
};
