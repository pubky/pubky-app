import { Container } from '@/atoms/Container/Container';
import { PAGE_GUTTER_CLASS } from '@/config/layoutClasses';
import { SignInContent, SignInFooter } from '@/organisms/SignIn/SignIn';
import { SignInNavigation } from '@/organisms/SignInNavigation/SignInNavigation';

export function SignInPage() {
  return (
    <Container size="container" className={PAGE_GUTTER_CLASS}>
      <SignInContent />
      <SignInFooter />
      <SignInNavigation />
    </Container>
  );
}
