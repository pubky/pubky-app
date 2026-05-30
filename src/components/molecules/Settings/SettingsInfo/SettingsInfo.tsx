'use client';

import Link from 'next/link';
import { ChevronRight, FileText, LockKeyhole, MessageCircleQuestion } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { SETTINGS_ROUTES } from '@/app/routes';
import { Container } from '@/atoms/Container/Container';
import { FilterHeader, FilterList, FilterRoot } from '@/atoms/Filter/Filter';
import { Image } from '@/atoms/Image/Image';
import { Link as AtomsLink } from '@/atoms/Link/Link';
import { SidebarButton } from '@/atoms/SidebarButton/SidebarButton';
import { Typography } from '@/atoms/Typography/Typography';
import { APP_VERSION } from '@/config/app';
import { APP_RELEASE_URL } from '@/config/externalLinks';
import { cn } from '@/libs/utils/utils';
import { DialogPrivacy } from '@/organisms/DialogPrivacy/DialogPrivacy';
import { DialogTerms } from '@/organisms/DialogTerms/DialogTerms';
import { FeedbackCard } from '@/organisms/FeedbackCard/FeedbackCard';
import { COPYRIGHT_TEXT, FAQ_QUESTION_KEYS } from './SettingsInfo.constants';
import type { SettingsInfoProps } from './SettingsInfo.types';

export function SettingsInfo({ className, hideFAQ = false }: SettingsInfoProps) {
  const t = useTranslations('settingsInfo');
  return (
    <Container overrideDefaults className={cn('flex w-full min-w-0 flex-col gap-6', className)}>
      {/* Terms of Service & Privacy Section */}
      <FilterRoot>
        <FilterHeader title={t('termsPrivacy.title')} subtitle={t('termsPrivacy.subtitle')} />
        <FilterList className="gap-2">
          <DialogTerms trigger={<SidebarButton icon={FileText}>{t('termsPrivacy.termsOfService')}</SidebarButton>} />
          <DialogPrivacy
            trigger={<SidebarButton icon={LockKeyhole}>{t('termsPrivacy.privacyPolicy')}</SidebarButton>}
          />
        </FilterList>
      </FilterRoot>

      {/* FAQ Section - Hidden when on FAQ page */}
      {!hideFAQ && (
        <FilterRoot>
          <FilterHeader title={t('faq.title')} />
          <FilterList className="gap-2">
            {FAQ_QUESTION_KEYS.map((key) => (
              <Link key={key} href={SETTINGS_ROUTES.HELP}>
                <Container
                  overrideDefaults
                  className="relative w-full min-w-0 cursor-pointer rounded-md border border-border p-4 transition-colors hover:border-white"
                >
                  <Typography
                    as="span"
                    size="sm"
                    overrideDefaults
                    className="block pr-6 leading-normal font-bold text-popover-foreground"
                  >
                    {t(`faq.questions.${key}`)}
                  </Typography>
                  <Container overrideDefaults className="absolute top-1/2 right-3 -translate-y-1/2">
                    <ChevronRight size={16} />
                  </Container>
                </Container>
              </Link>
            ))}
            <Link href={SETTINGS_ROUTES.HELP} className="w-full">
              <SidebarButton icon={MessageCircleQuestion}>{t('faq.moreFaq')}</SidebarButton>
            </Link>
          </FilterList>
        </FilterRoot>
      )}

      {/* Feedback Section */}
      <FeedbackCard />

      {/* Version Section */}
      <Container overrideDefaults className="flex flex-col gap-2">
        <Typography as="span" size="lg" className="font-light text-muted-foreground">
          {t('version.title')}
        </Typography>
        <Typography as="span" size="md" overrideDefaults className="text-base font-medium text-secondary-foreground">
          Pubky{' '}
          <AtomsLink href={APP_RELEASE_URL} target="_blank" variant="muted" className="text-base font-medium">
            v{APP_VERSION}
          </AtomsLink>
        </Typography>
      </Container>

      {/* Copyright & Branding Section */}
      <Container overrideDefaults className="flex flex-col gap-4">
        <Typography as="p" size="md" overrideDefaults className="leading-normal font-medium text-secondary-foreground">
          {COPYRIGHT_TEXT}
        </Typography>
        {/* Synonym Logo with Tether tagline */}
        <Container overrideDefaults className="flex flex-col items-start">
          <AtomsLink href="https://synonym.to" target="_blank" className="block" aria-label="Synonym">
            <Image src="/images/synonym-white-logo.svg" alt="Synonym" width={96} height={24} />
          </AtomsLink>
          <Image src="/images/a-tether-company.svg" alt="a tether company" width={109} height={16} />
        </Container>
      </Container>
    </Container>
  );
}
