import { Container } from '@/atoms/Container/Container';

export interface ProfilePageLayoutWrapperProps {
  children: React.ReactNode;
}

export function ProfilePageLayoutWrapper({ children }: ProfilePageLayoutWrapperProps) {
  return (
    <Container
      overrideDefaults={true}
      className="mx-auto mt-6 w-full max-w-(--container-max-width) px-6 pt-0 pb-24 lg:mt-0 lg:pb-0 xl:px-0"
    >
      {children}
    </Container>
  );
}
