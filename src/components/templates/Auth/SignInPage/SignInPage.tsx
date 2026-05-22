import { Container } from '@/atoms/Container/Container';
import { SignInContent, SignInFooter } from '@/organisms/SignIn/SignIn';
import { SignInNavigation } from '@/organisms/SignInNavigation/SignInNavigation';

export function SignInPage() {
  return (
    <Container size="container" className="px-6">
      <SignInContent />
      <SignInFooter />
      <SignInNavigation />
    </Container>
  );
}
