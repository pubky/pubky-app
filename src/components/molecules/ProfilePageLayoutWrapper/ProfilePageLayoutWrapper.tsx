import { Container } from '@/atoms/Container/Container';
import { CONTENT_GUTTER_CLASS, MOBILE_FAB_CLEARANCE_CLASS } from '@/config/layoutClasses';
import { cn } from '@/libs/utils/utils';

export interface ProfilePageLayoutWrapperProps {
  children: React.ReactNode;
}

export function ProfilePageLayoutWrapper({ children }: ProfilePageLayoutWrapperProps) {
  return (
    <Container
      overrideDefaults={true}
      className={cn(
        'mx-auto mt-6 w-full max-w-(--container-max-width) pt-0 lg:mt-0 lg:pb-0',
        MOBILE_FAB_CLEARANCE_CLASS,
        CONTENT_GUTTER_CLASS,
      )}
    >
      {children}
    </Container>
  );
}
