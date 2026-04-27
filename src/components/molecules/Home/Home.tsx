'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';

import * as Molecules from '@/molecules';
import * as Atoms from '@/atoms';
import * as Organisms from '@/organisms';
import * as Config from '@/config';
import * as App from '@/app';
import { cn } from '@/libs/utils/utils';

export const HomeActions = () => {
  const t = useTranslations('landing');
  const router = useRouter();

  const handleCreateAccount = () => {
    router.push(App.ONBOARDING_ROUTES.HUMAN);
  };

  const handleSignIn = () => {
    router.push(App.AUTH_ROUTES.SIGN_IN);
  };

  return (
    <Molecules.ActionButtons
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
    <Atoms.Container className={cn('flex-1 flex-col items-start justify-end gap-1 pt-3', props.className)} {...props}>
      <Atoms.FooterLinks>
        {tFooter.rich('agreement', {
          pubky: () => <span className="text-brand">Pubky</span>,
        })}{' '}
        <Organisms.DialogTerms />, <Organisms.DialogPrivacy />
        {tFooter('andConfirmAge')} <Organisms.DialogAge />{' '}
        {tFooter.rich('copyright', {
          pubkyCore: (chunks) => (
            <Atoms.Link href={Config.PUBKY_CORE_URL} target="_blank">
              {chunks}
            </Atoms.Link>
          ),
        })}
      </Atoms.FooterLinks>
      <Atoms.Container className="flex-row items-center gap-1 pt-2">
        <Atoms.Link href="https://synonym.to" target="_blank" className="block">
          <Atoms.Image src="/images/synonym-grey-logo.svg" alt="Synonym" width={95} height={24} />
        </Atoms.Link>
        <Atoms.Typography
          as="span"
          size="sm"
          className="inline-flex items-center gap-1 font-normal text-muted-foreground"
        >
          {t.rich('aTetherCompany', {
            tether: () => <Atoms.Image src="/images/tether-text.svg" alt="tether." width={40} height={9} />,
          })}
        </Atoms.Typography>
      </Atoms.Container>
    </Atoms.Container>
  );
};

export const HomeSectionTitle = () => {
  const t = useTranslations('landing');
  return (
    <Atoms.Container className="flex-row items-start gap-2">
      <Atoms.Typography size="md" className="self-center font-light text-brand sm:text-2xl">
        {t('subtitle')}
      </Atoms.Typography>
    </Atoms.Container>
  );
};

export const HomePageHeading = () => {
  const t = useTranslations('landing');
  return (
    <Atoms.Heading level={1} size="2xl">
      {t.rich('title', {
        highlight: (chunks) => (
          <>
            <span className="text-brand">{chunks}</span> <br className="block sm:hidden" />
          </>
        ),
      })}
    </Atoms.Heading>
  );
};
