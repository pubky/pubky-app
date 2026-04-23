'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import * as Atoms from '@/atoms';
import * as Libs from '@/libs';
import * as Organisms from '@/organisms';
import * as App from '@/app';
import { APP_RELEASE_URL, APP_VERSION } from '@/config';
import type { SettingsInfoProps } from './SettingsInfo.types';
import { FAQ_QUESTION_KEYS, COPYRIGHT_TEXT } from './SettingsInfo.constants';
import { FileText, LockKeyhole, ChevronRight, MessageCircleQuestion } from 'lucide-react';
export function SettingsInfo({ className, hideFAQ = false }: SettingsInfoProps) {
  const t = useTranslations('settingsInfo');
  return (
    <Atoms.Container overrideDefaults className={Libs.cn('flex w-full min-w-0 flex-col gap-6', className)}>
      {/* Terms of Service & Privacy Section */}
      <Atoms.FilterRoot>
        <Atoms.FilterHeader title={t('termsPrivacy.title')} subtitle={t('termsPrivacy.subtitle')} />
        <Atoms.FilterList className="gap-2">
          <Organisms.DialogTerms
            trigger={<Atoms.SidebarButton icon={FileText}>{t('termsPrivacy.termsOfService')}</Atoms.SidebarButton>}
          />
          <Organisms.DialogPrivacy
            trigger={<Atoms.SidebarButton icon={LockKeyhole}>{t('termsPrivacy.privacyPolicy')}</Atoms.SidebarButton>}
          />
        </Atoms.FilterList>
      </Atoms.FilterRoot>

      {/* FAQ Section - Hidden when on FAQ page */}
      {!hideFAQ && (
        <Atoms.FilterRoot>
          <Atoms.FilterHeader title={t('faq.title')} />
          <Atoms.FilterList className="gap-2">
            {FAQ_QUESTION_KEYS.map((key) => (
              <Link key={key} href={App.SETTINGS_ROUTES.HELP}>
                <Atoms.Container
                  overrideDefaults
                  className="relative w-full min-w-0 cursor-pointer rounded-md border border-border p-4 transition-colors hover:border-white"
                >
                  <Atoms.Typography
                    as="span"
                    size="sm"
                    overrideDefaults
                    className="block pr-6 leading-normal font-bold text-popover-foreground"
                  >
                    {t(`faq.questions.${key}`)}
                  </Atoms.Typography>
                  <Atoms.Container overrideDefaults className="absolute top-1/2 right-3 -translate-y-1/2">
                    <ChevronRight size={16} />
                  </Atoms.Container>
                </Atoms.Container>
              </Link>
            ))}
            <Link href={App.SETTINGS_ROUTES.HELP} className="w-full">
              <Atoms.SidebarButton icon={MessageCircleQuestion}>{t('faq.moreFaq')}</Atoms.SidebarButton>
            </Link>
          </Atoms.FilterList>
        </Atoms.FilterRoot>
      )}

      {/* Feedback Section */}
      <Organisms.FeedbackCard />

      {/* Version Section */}
      <Atoms.Container overrideDefaults className="flex flex-col gap-2">
        <Atoms.Typography as="span" size="lg" className="font-light text-muted-foreground">
          {t('version.title')}
        </Atoms.Typography>
        <Atoms.Typography
          as="span"
          size="md"
          overrideDefaults
          className="text-base font-medium text-secondary-foreground"
        >
          Pubky{' '}
          <Atoms.Link href={APP_RELEASE_URL} target="_blank" variant="muted" className="text-base font-medium">
            v{APP_VERSION}
          </Atoms.Link>
        </Atoms.Typography>
      </Atoms.Container>

      {/* Copyright & Branding Section */}
      <Atoms.Container overrideDefaults className="flex flex-col gap-4">
        <Atoms.Typography
          as="p"
          size="md"
          overrideDefaults
          className="leading-normal font-medium text-secondary-foreground"
        >
          {COPYRIGHT_TEXT}
        </Atoms.Typography>
        {/* Synonym Logo with Tether tagline */}
        <Atoms.Container overrideDefaults className="flex flex-col items-start">
          <Atoms.Link href="https://synonym.to" target="_blank" className="block" aria-label="Synonym">
            <Atoms.Image src="/images/synonym-white-logo.svg" alt="Synonym" width={96} height={24} />
          </Atoms.Link>
          <Atoms.Image src="/images/a-tether-company.svg" alt="a tether company" width={109} height={16} />
        </Atoms.Container>
      </Atoms.Container>
    </Atoms.Container>
  );
}
