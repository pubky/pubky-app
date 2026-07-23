import { Container } from '@/atoms/Container/Container';
import { cn } from '@/libs/utils/utils';
import { OnboardingLayoutProps } from './OnboardingLayout.types';

export function OnboardingLayout({
  testId,
  children,
  navigation,
  pinNavigationToBottom = true,
}: OnboardingLayoutProps) {
  return (
    <Container
      size="container"
      className="h-screen-without-page-header-onboarding items-stretch gap-0 px-6 pt-4 pb-0 lg:min-h-0 lg:items-start lg:pb-6"
    >
      <div
        data-testid={testId}
        className={cn('flex w-full flex-1 flex-col gap-0 lg:flex-none', !pinNavigationToBottom && 'flex-none')}
      >
        {children}
      </div>
      {navigation && (
        <div className={cn('onboarding-nav mt-auto w-full lg:mt-0', !pinNavigationToBottom && 'mt-3')}>
          {navigation}
        </div>
      )}
    </Container>
  );
}
