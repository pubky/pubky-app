import * as Atoms from '@/atoms';
import * as Organisms from '@/organisms';

export function SignIn() {
  return (
    <Atoms.Container size="container" className="px-6 xl:px-0">
      <Organisms.SignInContent />
      <Organisms.SignInFooter />
      <Organisms.SignInNavigation />
    </Atoms.Container>
  );
}
