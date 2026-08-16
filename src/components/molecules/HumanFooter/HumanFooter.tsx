'use client';
import { Container } from '@/atoms/Container/Container';
import { FooterLinks } from '@/atoms/FooterLinks/FooterLinks';
import { Link } from '@/atoms/Link/Link';
import { getPubkyCoreLink } from '@/config/externalLinks';
import { cn } from '@/libs/utils/utils';
import { DialogAge } from '@/organisms/DialogAge/DialogAge';
import { DialogPrivacy } from '@/organisms/DialogPrivacy/DialogPrivacy';
import { DialogTerms } from '@/organisms/DialogTerms/DialogTerms';

export const HumanFooter = () => {
  return (
    <Container className={cn('flex-col gap-0 py-6')}>
      <FooterLinks>
        {'By creating a '}
        <span className="text-brand">Pubky</span>
        {' account, you agree to the'} <DialogTerms />, <DialogPrivacy />
        {', and confirm you are'} <DialogAge />
      </FooterLinks>
      <FooterLinks>
        {'Pubky is powered by '}
        <Link href={getPubkyCoreLink()} target="_blank">
          {'Pubky Core'}
        </Link>
        {' and was built with love and dedication by Synonym Software, S.A. DE C.V. ©2026. All rights reserved.'}
      </FooterLinks>
    </Container>
  );
};
