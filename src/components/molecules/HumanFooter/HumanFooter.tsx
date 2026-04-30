'use client';
import { Container } from '@/atoms/Container/Container';
import { FooterLinks } from '@/atoms/FooterLinks/FooterLinks';
import { Link } from '@/atoms/Link/Link';
import { DialogAge } from '@/organisms/DialogAge/DialogAge';
import { DialogPrivacy } from '@/organisms/DialogPrivacy/DialogPrivacy';
import { DialogTerms } from '@/organisms/DialogTerms/DialogTerms';

import { PUBKY_CORE_URL } from '@/config/externalLinks';
import { useTranslations } from 'next-intl';
import { cn } from '@/libs/utils/utils';

export const HumanFooter = () => {
  const t = useTranslations('onboarding.footer');
  return (
    <Container className={cn('flex-col gap-0 py-6')}>
      <FooterLinks>
        {t.rich('agreement', {
          pubky: () => <span className="text-brand">Pubky</span>,
        })}{' '}
        <DialogTerms />, <DialogPrivacy />
        {t('andConfirmAge')} <DialogAge />
      </FooterLinks>
      <FooterLinks>
        {t.rich('copyright', {
          pubkyCore: (chunks) => (
            <Link href={PUBKY_CORE_URL} target="_blank">
              {chunks}
            </Link>
          ),
        })}
      </FooterLinks>
    </Container>
  );
};
