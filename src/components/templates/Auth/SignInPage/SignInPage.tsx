import { Container } from '@/atoms/Container/Container';
import { CONTENT_GUTTER_CLASS } from '@/config/layoutClasses';
import { SignInContent, SignInFooter } from '@/organisms/SignIn/SignIn';
import { SignInNavigation } from '@/organisms/SignInNavigation/SignInNavigation';

export function SignInPage() {
  return (
    <Container size="container" className={CONTENT_GUTTER_CLASS}>
      <SignInContent />
      <SignInFooter />
      <SignInNavigation />
    </Container>
  );
}
