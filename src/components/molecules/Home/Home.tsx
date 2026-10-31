'use client';

import { useRouter } from 'next/navigation';
import { APP_ROUTES, LEGAL_ROUTES } from '@/app/routes';
import { Container } from '@/atoms/Container/Container';
import { FooterLinks } from '@/atoms/FooterLinks/FooterLinks';
import { Heading } from '@/atoms/Heading/Heading';
import { Image } from '@/atoms/Image/Image';
import { Link } from '@/atoms/Link/Link';
import { Typography } from '@/atoms/Typography/Typography';
import { getPubkyProtocolLink } from '@/config/externalLinks';
import { LEGAL_ENTITY_NAME } from '@/config/legal';
import { useJoinRoute } from '@/hooks/useJoinRoute/useJoinRoute';
import { usePassportAuth } from '@/hooks/usePassportAuth/usePassportAuth';
import { usePassportEligibility } from '@/hooks/usePassportEligibility/usePassportEligibility';
import { cn } from '@/libs/utils/utils';
import { DialogAge } from '@/organisms/DialogAge/DialogAge';
import { LANDING_NEXT_SECTION_ID } from '@/templates/Public/Landing/Landing.constants';
import { ActionButtons } from '../ActionButtons/ActionButtons';
import { HeaderSocialLinks } from '../Header/Header';

export const HomeActions = () => {
  const router = useRouter();
  const joinRoute = useJoinRoute();
  const passportEligibility = usePassportEligibility();
  const { startPassportAuth, isPending: isPassportPending } = usePassportAuth();

  const handleLearn = () => {
    document.getElementById(LANDING_NEXT_SECTION_ID)?.scrollIntoView({ behavior: 'smooth' });
  };

  const handleCreateAccount = () => {
    router.push(joinRoute);
  };

  const handleExplore = () => {
    router.push(APP_ROUTES.HOME);
  };

  return (
    <ActionButtons
      onLearn={handleLearn}
      onExplore={handleExplore}
      onCreateAccount={handleCreateAccount}
      onContinueWithGoogle={passportEligibility === 'enabled' ? startPassportAuth : undefined}
      isContinueWithGooglePending={isPassportPending}
      className="gap-4"
    />
  );
};

export const HomeFooter = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => {
  return (
    <Container className={cn('flex-1 flex-col items-start justify-end gap-1', className)} {...props}>
      <FooterLinks className="[&_a]:no-underline">
        {'By joining, continuing, or creating a '}
        {'Pubky'}
        {' account, you agree to the'} <Link href={LEGAL_ROUTES.TERMS_OF_USE}>{'Terms of Service'}</Link>,{' '}
        <Link href={LEGAL_ROUTES.PRIVACY_POLICY}>{'Privacy Policy'}</Link>
        {', and confirm you are'} <DialogAge /> {'Pubky is powered by '}
        <Link href={getPubkyProtocolLink()} target="_blank" className="font-semibold">
          {'Pubky Protocol'}
        </Link>
        {` and was built by ${LEGAL_ENTITY_NAME} ©2026. All rights reserved.`}
      </FooterLinks>
      <Container className="mt-2 flex-col items-start gap-4 md:flex-row md:items-center md:justify-between">
        <HomeBrandFooter />
        <HeaderSocialLinks className="mr-0 flex justify-start gap-4 md:justify-end" />
      </Container>
    </Container>
  );
};

export const HomeBrandFooter = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => {
  return (
    <div
      className={cn(
        'landing-brand-footer inline-flex min-w-max items-center gap-2 whitespace-nowrap transition-opacity duration-300 [&_*]:shrink-0',
        className,
      )}
      {...props}
    >
      <Link href="https://synonym.to" target="_blank" className="inline-flex items-center">
        <Image src="/images/synonym-grey-logo.svg" alt="Synonym" width={95} height={24} className="max-w-none" />
      </Link>
      <Link href="https://tether.io/" target="_blank" className="inline-flex items-center">
        <Image
          src="/images/a-tether-company.svg"
          alt="a tether. company"
          width={109}
          height={16}
          className="max-w-none translate-y-px [.light_&]:invert"
        />
      </Link>
    </div>
  );
};

export const HomeSectionTitle = () => {
  return (
    <Container className="flex-row items-start gap-2">
      <Typography as="h2" overrideDefaults className="self-center text-xl font-light text-muted-foreground sm:text-3xl">
        {'Your keys, your content, your rules.'}
      </Typography>
    </Container>
  );
};

export const HomePageHeading = () => {
  return (
    <Heading level={1} size="2xl" className="lg:max-xl:text-[104px]">
      <span className="text-brand">{'Unlock'}</span>
      <br />
      {' the web.'}
    </Heading>
  );
};
