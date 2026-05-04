'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/atoms/Button/Button';
import { Container } from '@/atoms/Container/Container';
import { Heading } from '@/atoms/Heading/Heading';
import { Typography } from '@/atoms/Typography/Typography';
import { FAQAccordion } from '../../FAQAccordion/FAQAccordion';
import { SettingsDivider } from '../SettingsDivider/SettingsDivider';
import { DialogFeedback } from '@/organisms/DialogFeedback/DialogFeedback';
import { DialogPrivacy } from '@/organisms/DialogPrivacy/DialogPrivacy';
import { DialogTerms } from '@/organisms/DialogTerms/DialogTerms';

import { SUPPORT_LINKS } from './HelpContent.constants';
import type { FAQAccordionItem } from '../../FAQAccordion/FAQAccordion.types';

import { HelpCircle, FileText, MessageCircle, Send, LockKeyhole, MessageSquare } from 'lucide-react';
export function HelpContent() {
  const t = useTranslations('help');
  const [isFeedbackDialogOpen, setIsFeedbackDialogOpen] = useState(false);
  const handleUserGuideClick = () => {
    window.open(SUPPORT_LINKS.userGuide, '_blank', 'noopener,noreferrer');
  };
  const handleSupportClick = () => {
    window.open(SUPPORT_LINKS.telegram, '_blank', 'noopener,noreferrer');
  };
  const handleFeedbackClick = () => {
    setIsFeedbackDialogOpen(true);
  };

  // Build FAQ sections from translations
  const faqSections = [
    {
      id: 'onboarding',
      title: t('sections.onboarding'),
      questions: [
        {
          id: '1',
          question: t('questions.q1'),
          answer: t('questions.a1'),
        },
        {
          id: '2',
          question: t('questions.q2'),
          answer: t('questions.a2'),
        },
        {
          id: '3',
          question: t('questions.q3'),
          answer: t('questions.a3'),
        },
      ] as FAQAccordionItem[],
    },
    {
      id: 'backup',
      title: t('sections.backup'),
      questions: [
        {
          id: '4',
          question: t('questions.q4'),
          answer: t('questions.a4'),
        },
        {
          id: '5',
          question: t('questions.q5'),
          answer: t('questions.a5'),
        },
        {
          id: '6',
          question: t('questions.q6'),
          answer: t('questions.a6'),
        },
        {
          id: '7',
          question: t('questions.q7'),
          answer: t('questions.a7'),
        },
        {
          id: '8',
          question: t('questions.q8'),
          answer: t('questions.a8'),
        },
        {
          id: '9',
          question: t('questions.q9'),
          answer: t('questions.a9'),
        },
      ] as FAQAccordionItem[],
    },
    {
      id: 'profile',
      title: t('sections.profile'),
      questions: [
        {
          id: '10',
          question: t('questions.q10'),
          answer: t('questions.a10'),
        },
        {
          id: '11',
          question: t('questions.q11'),
          answer: t('questions.a11'),
        },
        {
          id: '12',
          question: t('questions.q12'),
          answer: t('questions.a12'),
        },
      ] as FAQAccordionItem[],
    },
    {
      id: 'pubky',
      title: t('sections.pubky'),
      questions: [
        {
          id: '13',
          question: t('questions.q13'),
          answer: t('questions.a13'),
        },
        {
          id: '14',
          question: t('questions.q14'),
          answer: t('questions.a14'),
        },
      ] as FAQAccordionItem[],
    },
  ];
  return (
    <Container overrideDefaults className="flex w-full flex-col items-start gap-10">
      {/* FAQ Section */}
      <Container overrideDefaults className="flex w-full flex-col items-start gap-6">
        <Container overrideDefaults className="inline-flex items-center gap-3">
          <HelpCircle size={24} />
          <Heading level={2} size="lg" className="leading-8">
            {t('faq')}
          </Heading>
        </Container>
        <Typography as="p" overrideDefaults className="text-base leading-6 font-medium text-secondary-foreground">
          {t('faqDescription')}
        </Typography>

        <Container overrideDefaults className="flex w-full flex-col items-start gap-6">
          {faqSections.map((section) => (
            <Container key={section.id} overrideDefaults className="flex w-full flex-col items-start gap-6">
              <Heading level={4} size="md" className="leading-7 font-bold">
                {section.title}
              </Heading>
              <FAQAccordion items={section.questions} className="w-full gap-3" />
            </Container>
          ))}
        </Container>
      </Container>

      <SettingsDivider />

      {/* Feedback Section - Mobile only (hidden on lg screens where sidebar is visible) */}
      <Container overrideDefaults className="flex w-full flex-col items-start gap-6 lg:hidden">
        <Container overrideDefaults className="inline-flex items-center gap-3">
          <MessageSquare size={24} />
          <Heading level={2} size="lg" className="leading-8">
            {t('feedback')}
          </Heading>
        </Container>
        <Typography as="p" overrideDefaults className="text-base leading-6 font-medium text-secondary-foreground">
          {t('feedbackDescription')}
        </Typography>
        <Button id="feedback-btn" variant="secondary" size="default" onClick={handleFeedbackClick}>
          <Send size={16} />
          {t('sendFeedback')}
        </Button>
      </Container>

      <Container overrideDefaults className="w-full lg:hidden">
        <SettingsDivider />
      </Container>

      {/* User Guide Section */}
      <Container overrideDefaults className="flex w-full flex-col items-start gap-6">
        <Container overrideDefaults className="inline-flex items-center gap-3">
          <FileText size={24} />
          <Heading level={2} size="lg" className="leading-8">
            {t('userGuide')}
          </Heading>
        </Container>
        <Typography as="p" overrideDefaults className="text-base leading-6 font-medium text-secondary-foreground">
          {t('userGuideDescription')}
        </Typography>
        <Button id="user-guide-btn" variant="secondary" size="default" onClick={handleUserGuideClick}>
          <FileText size={16} />
          {t('userGuideButton')}
        </Button>
      </Container>

      <SettingsDivider />

      {/* Support Section */}
      <Container overrideDefaults className="flex w-full flex-col items-start gap-6">
        <Container overrideDefaults className="inline-flex items-center gap-3">
          <MessageCircle size={24} />
          <Heading level={2} size="lg" className="leading-8">
            {t('support')}
          </Heading>
        </Container>
        <Typography as="p" overrideDefaults className="text-base leading-6 font-medium text-secondary-foreground">
          {t('supportDescription')}
        </Typography>
        <Button id="support-btn" variant="secondary" size="default" onClick={handleSupportClick}>
          <Send size={16} />
          {t('supportButton')}
        </Button>
      </Container>

      {/* Terms of Service & Privacy - Mobile only (hidden on lg screens where sidebar is visible) */}
      <Container overrideDefaults className="flex w-full flex-col items-start gap-6 lg:hidden">
        <SettingsDivider />
        <Container overrideDefaults className="flex w-full flex-col items-start gap-6">
          <Container overrideDefaults className="inline-flex items-center gap-3">
            <LockKeyhole size={24} />
            <Heading level={2} size="lg" className="leading-8">
              {t('termsPrivacy')}
            </Heading>
          </Container>
          <Typography as="p" overrideDefaults className="text-base leading-6 font-medium text-secondary-foreground">
            {t('termsPrivacyDescription')}
          </Typography>
          <Container overrideDefaults className="flex flex-wrap gap-2">
            <DialogTerms
              trigger={
                <Button id="tos-btn" variant="secondary" size="default">
                  <FileText size={16} />
                  {t('termsOfService')}
                </Button>
              }
            />
            <DialogPrivacy
              trigger={
                <Button id="privacy-btn" variant="secondary" size="default">
                  <LockKeyhole size={16} />
                  {t('privacyPolicy')}
                </Button>
              }
            />
          </Container>
        </Container>
      </Container>

      {/* Feedback Dialog */}
      <DialogFeedback open={isFeedbackDialogOpen} onOpenChange={setIsFeedbackDialogOpen} />
    </Container>
  );
}
