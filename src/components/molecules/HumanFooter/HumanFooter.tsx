'use client';

import * as Atoms from '@/atoms';
import * as Organisms from '@/organisms';
import * as Config from '@/config';
import { useTranslations } from 'next-intl';
import { cn } from '@/libs/utils/utils';

export const HumanFooter = () => {
  const t = useTranslations('onboarding.footer');
  return (
    <Atoms.Container className={cn('flex-col gap-0 py-6')}>
      <Atoms.FooterLinks>
        {t.rich('agreement', {
          pubky: () => <span className="text-brand">Pubky</span>,
        })}{' '}
        <Organisms.DialogTerms />, <Organisms.DialogPrivacy />
        {t('andConfirmAge')} <Organisms.DialogAge />
      </Atoms.FooterLinks>
      <Atoms.FooterLinks>
        {t.rich('copyright', {
          pubkyCore: (chunks) => (
            <Atoms.Link href={Config.PUBKY_CORE_URL} target="_blank">
              {chunks}
            </Atoms.Link>
          ),
        })}
      </Atoms.FooterLinks>
    </Atoms.Container>
  );
};
