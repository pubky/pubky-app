'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { ActionButtons } from '../ActionButtons/ActionButtons';
import { Container } from '@/atoms/Container/Container';
import { FooterLinks } from '@/atoms/FooterLinks/FooterLinks';
import { Heading } from '@/atoms/Heading/Heading';
import { Image } from '@/atoms/Image/Image';
import { Link } from '@/atoms/Link/Link';
import { Typography } from '@/atoms/Typography/Typography';
import { DialogAge } from '@/organisms/DialogAge/DialogAge';
import { DialogPrivacy } from '@/organisms/DialogPrivacy/DialogPrivacy';
import { DialogTerms } from '@/organisms/DialogTerms/DialogTerms';

import { PUBKY_CORE_URL } from '@/config/externalLinks';
import { AUTH_ROUTES, ONBOARDING_ROUTES } from '@/app/routes';
import { cn } from '@/libs/utils/utils';

export const HomeActions = () => {
  const t = useTranslations('landing');
  const router = useRouter();

  const handleCreateAccount = () => {
    router.push(ONBOARDING_ROUTES.HUMAN);
  };

  const handleSignIn = () => {
    router.push(AUTH_ROUTES.SIGN_IN);
  };

  return (
    <ActionButtons
      onSignIn={handleSignIn}
      onCreateAccount={handleCreateAccount}
      signInText={t('signIn')}
      createAccountText={t('createAccount')}
    />
  );
};

export const HomeFooter = ({ ...props }: React.HTMLAttributes<HTMLDivElement>) => {
  const t = useTranslations('landing');
  const tFooter = useTranslations('onboarding.footer');
  return (
    <Container className={cn('flex-1 flex-col items-start justify-end gap-1 pt-3', props.className)} {...props}>
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
      <Container className="flex-row items-center gap-1 pt-2">
        <Link href="https://synonym.to" target="_blank" className="block">
          <Image src="/images/synonym-grey-logo.svg" alt="Synonym" width={95} height={24} />
        </Link>
        <Typography as="span" size="sm" className="inline-flex items-center gap-1 font-normal text-muted-foreground">
          {t.rich('aTetherCompany', {
            tether: () => <Image src="/images/tether-text.svg" alt="tether." width={40} height={9} />,
          })}
        </Typography>
      </Container>
    </Container>
  );
};

export const HomeSectionTitle = () => {
  const t = useTranslations('landing');
  return (
    <Container className="flex-row items-start gap-2">
      <Typography size="md" className="self-center font-light text-brand sm:text-2xl">
        {t('subtitle')}
      </Typography>
    </Container>
  );
};

export const HomePageHeading = () => {
  const t = useTranslations('landing');
  return (
    <Heading level={1} size="2xl">
      {t.rich('title', {
        highlight: (chunks) => (
          <>
            <span className="text-brand">{chunks}</span> <br className="block sm:hidden" />
          </>
        ),
      })}
    </Heading>
  );
};
