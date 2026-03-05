import * as Atoms from '@/atoms';

export interface ProfilePageLayoutWrapperProps {
  children: React.ReactNode;
}

export function ProfilePageLayoutWrapper({ children }: ProfilePageLayoutWrapperProps) {
  return (
    <Atoms.Container
      overrideDefaults={true}
      className="mx-auto mt-6 w-full max-w-(--container-max-width) px-6 pt-0 xl:px-0"
    >
      {children}
    </Atoms.Container>
  );
}
