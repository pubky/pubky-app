'use client';

import { useRouter } from 'next/navigation';

import * as Atoms from '@/atoms';
import * as Organisms from '@/organisms';
import * as App from '@/app';
import { useSignInStore } from '@/stores/signIn/signIn.store';
export const SignInNavigation = () => {
  const router = useRouter();
  const authUrlResolved = useSignInStore((state) => state.authUrlResolved);

  if (authUrlResolved) return null;

  const handleRestore = () => {
    router.push(App.HOME_ROUTES.HOME);
  };

  return (
    <Atoms.Container className="flex-col-reverse justify-start gap-3 md:flex-row lg:gap-6">
      <Atoms.Container className="mx-0 w-auto flex-col items-start justify-start gap-3 sm:mx-auto sm:w-full sm:flex-row">
        <Organisms.DialogRestoreRecoveryPhrase onRestore={handleRestore} />
        <Organisms.DialogRestoreEncryptedFile onRestore={handleRestore} />
      </Atoms.Container>
    </Atoms.Container>
  );
};
