'use client';
import { LEGAL_ROUTES } from '@/app/routes';
import { Container } from '@/atoms/Container/Container';
import { FooterLinks } from '@/atoms/FooterLinks/FooterLinks';
import { Link } from '@/atoms/Link/Link';
import { getPubkyProtocolLink } from '@/config/externalLinks';
import { LEGAL_ENTITY_NAME } from '@/config/legal';
import { cn } from '@/libs/utils/utils';
import { DialogAge } from '@/organisms/DialogAge/DialogAge';

export const HumanFooter = () => {
  return (
    <Container className={cn('flex-col gap-0 py-6')}>
      <FooterLinks className="[&_a]:no-underline">
        {'By creating a '}
        {'Pubky'}
        {' account, you agree to the'}{' '}
        <Link href={LEGAL_ROUTES.TERMS_OF_USE} target="_blank">
          {'Terms of Service'}
        </Link>
        ,{' '}
        <Link href={LEGAL_ROUTES.PRIVACY_POLICY} target="_blank">
          {'Privacy Policy'}
        </Link>
        {', and confirm you are'} <DialogAge />
      </FooterLinks>
      <FooterLinks>
        {'Pubky is powered by '}
        <Link href={getPubkyProtocolLink()} target="_blank">
          {'Pubky Protocol'}
        </Link>
        {` and was built by ${LEGAL_ENTITY_NAME} ©2026. All rights reserved.`}
      </FooterLinks>
    </Container>
  );
};
