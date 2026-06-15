'use client';

import { useRouter } from 'next/navigation';
import { UserRoundPlus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { ONBOARDING_ROUTES } from '@/app/routes';
import { Button } from '@/atoms/Button/Button';
import { Container } from '@/atoms/Container/Container';
import { FooterLinks } from '@/atoms/FooterLinks/FooterLinks';
import { Heading } from '@/atoms/Heading/Heading';
import { Link } from '@/atoms/Link/Link';
import { PUBKY_CORE_URL } from '@/config/externalLinks';
import { HomeBrandFooter } from '@/molecules/Home/Home';
import { Logo } from '@/molecules/Logo/Logo';
import { DialogAge } from '@/organisms/DialogAge/DialogAge';
import { DialogPrivacy } from '@/organisms/DialogPrivacy/DialogPrivacy';
import { DialogTerms } from '@/organisms/DialogTerms/DialogTerms';
import { LANDING_FINAL_SECTION_ID } from './Landing.constants';

export function LandingFinalSection() {
  const router = useRouter();
  const t = useTranslations('landing.final');
  const tFooter = useTranslations('onboarding.footer');

  const handleJoin = () => {
    router.push(ONBOARDING_ROUTES.HUMAN);
  };

  return (
    <section id={LANDING_FINAL_SECTION_ID} className="relative z-0 flex min-h-svh items-center px-6 py-20">
      <Container size="container" className="items-center gap-8 text-center">
        <Heading level={2} size="xl" className="max-w-[820px] text-5xl sm:text-7xl">
          {t.rich('title', {
            highlight: (chunks) => <span className="text-brand">{chunks}</span>,
            line: (chunks) => <span className="block">{chunks}</span>,
          })}
        </Heading>
        <Button variant="brand" size="lg" className="px-10" onClick={handleJoin}>
          <UserRoundPlus className="mr-2 h-4 w-4" />
          {t('joinNow')}
        </Button>
        <Logo noLink width={151} height={50} />
        <FooterLinks className="max-w-xl text-center">
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
        <HomeBrandFooter />
      </Container>
    </section>
  );
}
