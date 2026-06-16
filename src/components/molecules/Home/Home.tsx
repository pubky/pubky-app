'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { APP_ROUTES, ONBOARDING_ROUTES } from '@/app/routes';
import { Container } from '@/atoms/Container/Container';
import { FooterLinks } from '@/atoms/FooterLinks/FooterLinks';
import { Heading } from '@/atoms/Heading/Heading';
import { Image } from '@/atoms/Image/Image';
import { Link } from '@/atoms/Link/Link';
import { Typography } from '@/atoms/Typography/Typography';
import { PUBKY_CORE_URL } from '@/config/externalLinks';
import { cn } from '@/libs/utils/utils';
import { DialogAge } from '@/organisms/DialogAge/DialogAge';
import { DialogPrivacy } from '@/organisms/DialogPrivacy/DialogPrivacy';
import { DialogTerms } from '@/organisms/DialogTerms/DialogTerms';
import { LANDING_NEXT_SECTION_ID } from '@/templates/Public/Landing/Landing.constants';
import { ActionButtons } from '../ActionButtons/ActionButtons';

export const HomeActions = () => {
  const router = useRouter();

  const handleLearn = () => {
    document.getElementById(LANDING_NEXT_SECTION_ID)?.scrollIntoView({ behavior: 'smooth' });
  };

  const handleCreateAccount = () => {
    router.push(ONBOARDING_ROUTES.HUMAN);
  };

  const handleExplore = () => {
    router.push(APP_ROUTES.HOME);
  };

  return (
    <ActionButtons
      onLearn={handleLearn}
      onExplore={handleExplore}
      onCreateAccount={handleCreateAccount}
      className="gap-4"
    />
  );
};

export const HomeFooter = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => {
  const tFooter = useTranslations('onboarding.footer');
  return (
    <Container className={cn('flex-1 flex-col items-start justify-end gap-1', className)} {...props}>
      <FooterLinks>
        {tFooter.rich('agreement', {
          pubky: () => <span className="text-brand">Pubky</span>,
        })}{' '}
        <DialogTerms />, <DialogPrivacy />
        {tFooter('andConfirmAge')} <DialogAge />{' '}
        {tFooter.rich('copyright', {
          pubkyCore: (chunks) => (
            <Link href={PUBKY_CORE_URL} target="_blank">
              {chunks}
            </Link>
          ),
        })}
      </FooterLinks>
      <HomeBrandFooter className="mt-2" />
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
          className="max-w-none translate-y-px"
        />
      </Link>
    </div>
  );
};

export const HomeSectionTitle = () => {
  const t = useTranslations('landing');
  return (
    <Container className="flex-row items-start gap-2">
      <Typography as="h2" size="md" className="self-center font-light text-muted-foreground sm:text-3xl">
        {t('subtitle')}
      </Typography>
    </Container>
  );
};

export const HomePageHeading = () => {
  const t = useTranslations('landing');
  return (
    <Heading level={1} size="2xl" className="lg:max-xl:text-[104px]">
      {t.rich('title', {
        highlight: (chunks) => (
          <>
            <span className="text-brand">{chunks}</span>
            <br />
          </>
        ),
      })}
    </Heading>
  );
};
