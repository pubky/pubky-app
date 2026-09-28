'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { KeyRound } from 'lucide-react';
import { ONBOARDING_ROUTES } from '@/app/routes';
import { Button, ButtonVariant } from '@/atoms/Button/Button';
import { Container } from '@/atoms/Container/Container';
import { Image } from '@/atoms/Image/Image';
import { PageHeader } from '@/atoms/PageHeader/PageHeader';
import { PageSubtitle } from '@/atoms/PageSubtitle/PageSubtitle';
import { Typography } from '@/atoms/Typography/Typography';
import { usePassportAuth } from '@/hooks/usePassportAuth/usePassportAuth';
import { usePassportEligibility } from '@/hooks/usePassportEligibility/usePassportEligibility';
import { HumanFooter } from '@/molecules/HumanFooter/HumanFooter';
import { IllustratedCard } from '@/molecules/IllustratedCard/IllustratedCard';
import { OnboardingLayout } from '@/molecules/OnboardingLayout/OnboardingLayout';
import { PageTitle } from '@/molecules/Page/Page';
import { PassportMethodCard, PassportMethodSection } from '@/organisms/PassportMethodCard/PassportMethodCard';

const SOVEREIGN_METHOD_TITLE = 'Sovereign & Secure';
const SOVEREIGN_METHOD_DESCRIPTION = 'Take full control of your pubky.';
const SOVEREIGN_METHOD_ACTION = 'Manage your own keys';

/**
 * Sign-up step 1 when Pubky Passport is available: choose between managing your own keys (the
 * existing fair-access flow) and "Continue with Google" (Passport creates the identity and signs
 * it up through Homegate, so the fair-access step is skipped).
 *
 * Eligibility is resolved after mount. While pending, the shell renders without the Google option;
 * once resolved as disabled the page replaces itself with the fair-access step.
 */
export function Join() {
  const router = useRouter();
  const eligibility = usePassportEligibility();
  const { startPassportAuth, isPending } = usePassportAuth();

  useEffect(() => {
    if (eligibility === 'disabled') router.replace(ONBOARDING_ROUTES.HUMAN);
  }, [eligibility, router]);

  const isPassportEnabled = eligibility === 'enabled';

  const manageOwnKeysButton = (
    <Button
      type="button"
      variant={ButtonVariant.SECONDARY}
      size="lg"
      className="w-full"
      onClick={() => router.push(ONBOARDING_ROUTES.HUMAN)}
      disabled={isPending}
      data-testid="join-manage-own-keys"
    >
      <KeyRound className="size-4" />
      {SOVEREIGN_METHOD_ACTION}
    </Button>
  );

  return (
    <OnboardingLayout testId="join-content">
      <PageHeader>
        <PageTitle size="large">
          {"Let's join "}
          <span className="text-brand">{'Pubky.'}</span>
        </PageTitle>
        <PageSubtitle>{'How would you like to create your pubky?'}</PageSubtitle>
      </PageHeader>

      {/* Desktop: two method cards side by side */}
      <Container className="hidden gap-6 md:flex md:flex-row md:items-stretch" data-testid="join-methods">
        <IllustratedCard
          data-testid="join-sovereign-card"
          className="flex-1 rounded-md"
          visual={
            <Image
              priority
              src="/images/keyring.webp"
              alt="Lime Pubky keyring representing keys you control"
              width={192}
              height={192}
              className="size-48"
            />
          }
        >
          <Container className="gap-3">
            <Typography as="h3" size="lg" className="leading-8">
              {SOVEREIGN_METHOD_TITLE}
            </Typography>
            <Typography as="p" className="leading-6 text-secondary-foreground/80">
              {SOVEREIGN_METHOD_DESCRIPTION}
            </Typography>
          </Container>
          {manageOwnKeysButton}
        </IllustratedCard>
        {isPassportEnabled && <PassportMethodCard onContinue={startPassportAuth} isPending={isPending} />}
      </Container>

      {/* Mobile: stacked labelled sections */}
      <Container className="gap-6 md:hidden" data-testid="join-methods-mobile">
        <Container className="gap-3">
          <Typography as="p" size="xs" className="tracking-[1.2px] text-muted-foreground uppercase">
            {SOVEREIGN_METHOD_TITLE}
          </Typography>
          {manageOwnKeysButton}
        </Container>
        {isPassportEnabled && <PassportMethodSection onContinue={startPassportAuth} isPending={isPending} />}
      </Container>

      <HumanFooter />
    </OnboardingLayout>
  );
}
