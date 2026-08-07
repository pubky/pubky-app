'use client';

import { useState } from 'react';
import { FileText, HelpCircle, LockKeyhole, MessageCircle, MessageSquare, Send } from 'lucide-react';
import { Button } from '@/atoms/Button/Button';
import { Container } from '@/atoms/Container/Container';
import { Heading } from '@/atoms/Heading/Heading';
import { Typography } from '@/atoms/Typography/Typography';
import { DialogFeedback } from '@/organisms/DialogFeedback/DialogFeedback';
import { DialogPrivacy } from '@/organisms/DialogPrivacy/DialogPrivacy';
import { DialogTerms } from '@/organisms/DialogTerms/DialogTerms';
import { FAQAccordion } from '../../FAQAccordion/FAQAccordion';
import type { FAQAccordionItem } from '../../FAQAccordion/FAQAccordion.types';
import { SettingsDivider } from '../SettingsDivider/SettingsDivider';
import { SUPPORT_LINKS } from './HelpContent.constants';

export function HelpContent() {
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

  const faqSections = [
    {
      id: 'onboarding',
      title: '1. Getting Started & Onboarding',
      questions: [
        {
          id: '1',
          question: 'How do I use Pubky Ring with the web app?',
          answer:
            'First, create your keypair in the Pubky Ring app. Then visit the Pubky web app and log in using the same keypair. The apps are connected through your cryptographic identity.',
        },
        {
          id: '2',
          question: 'Why does login sometimes fail when using the PWA on Android?',
          answer:
            'Some browsers focused on security and privacy, like Vanadium or Tor, disable Just-In-Time (JIT) compilation for JavaScript by default, which prevents Pubky App from functioning properly.\n\nTo enable it, go to: Settings > Site settings > JavaScript JIT > Allowed.',
        },
      ] as FAQAccordionItem[],
    },
    {
      id: 'backup',
      title: '2. Backups & Account Recovery',
      questions: [
        {
          id: '3',
          question: 'How can I restore my account?',
          answer:
            'When you signed up, you were prompted to back up your identity using one of the following:\n\n- Recovery file (.pkarr)\n- Recovery phrase (mnemonic)\n- QR code\n\nTo restore with a .pkarr file:\n\n1. Select the file you saved.\n2. Enter your password.\n3. Click "Sign In".',
        },
        {
          id: '4',
          question: 'Can I restore my Pubky account on another device?',
          answer: 'Yes, if you have your .pkarr file or seed phrase.',
        },
        {
          id: '5',
          question: 'Can I convert a seed phrase into a .pkarr file later?',
          answer: 'Not yet. This functionality is planned for a future update.',
        },
        {
          id: '6',
          question: "I backed up my account but can't access the file. What happened?",
          answer:
            'Some operating systems may rename the .pkarr file or mislabel it. Try renaming the file extension to .pkarr and reimporting.',
        },
        {
          id: '7',
          question: 'I downloaded a .txt file instead of a .pkarr backup. What do I do?',
          answer:
            'This happens if you chose the mnemonic (seed phrase) backup option. Wait for future updates or recreate your account with a .pkarr backup.',
        },
        {
          id: '8',
          question: 'I missed downloading the recovery file. Can I back up again?',
          answer: 'Currently, backups can only be created once via the web app. This may change in future updates.',
        },
      ] as FAQAccordionItem[],
    },
    {
      id: 'profile',
      title: '3. Profile & Social Features',
      questions: [
        {
          id: '9',
          question: 'How can I update my profile information?',
          answer: 'Click your avatar (top-right corner), then click "Edit" to update your profile info.',
        },
        {
          id: '10',
          question: 'How can I delete my post?',
          answer: 'Hover over the three dots on the post you wish to delete and select "Delete Post".',
        },
        {
          id: '11',
          question: 'How do I mute someone?',
          answer: 'Go to their profile, click the three dots, and choose "Mute User".',
        },
      ] as FAQAccordionItem[],
    },
    {
      id: 'pubky',
      title: '4. How Pubky App Works',
      questions: [
        {
          id: '12',
          question: 'How is Pubky different from other social media platforms?',
          answer:
            'Pubky is built for self-sovereign, decentralized social interaction. Key differences:\n\n- You are the algorithm: customize what you see with semantic tags and curation.\n- No email or phone required: your identity is your public key.\n- Full control over your social graph via tagging and trust models.\n- Browser-based PWA that respects privacy.',
        },
        {
          id: '13',
          question: 'How does Pubky differ from Nostr?',
          answer:
            'Pubky uses Ed25519 keys for compatibility and avoids centralized relays. Instead, it uses a Distributed Hash Table (DHT) for decentralized lookup and identity resolution.',
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
            {'FAQ'}
          </Heading>
        </Container>
        <Typography as="p" overrideDefaults className="text-base leading-6 font-medium text-secondary-foreground">
          {'Frequently asked questions from Pubky users'}
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
            {'Feedback'}
          </Heading>
        </Container>
        <Typography as="p" overrideDefaults className="text-base leading-6 font-medium text-secondary-foreground">
          {"We'd love to hear your thoughts on Pubky. Share your feedback with us!"}
        </Typography>
        <Button id="feedback-btn" variant="secondary" size="default" onClick={handleFeedbackClick}>
          <Send size={16} />
          {'Send feedback'}
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
            {'User Guide'}
          </Heading>
        </Container>
        <Typography as="p" overrideDefaults className="text-base leading-6 font-medium text-secondary-foreground">
          {
            'The Pubky User Guide will help you navigate through the app, utilize its key features, and get the most out of your Pubky experience.'
          }
        </Typography>
        <Button id="user-guide-btn" variant="secondary" size="default" onClick={handleUserGuideClick}>
          <FileText size={16} />
          {'User guide'}
        </Button>
      </Container>

      <SettingsDivider />

      {/* Support Section */}
      <Container overrideDefaults className="flex w-full flex-col items-start gap-6">
        <Container overrideDefaults className="inline-flex items-center gap-3">
          <MessageCircle size={24} />
          <Heading level={2} size="lg" className="leading-8">
            {'Support'}
          </Heading>
        </Container>
        <Typography as="p" overrideDefaults className="text-base leading-6 font-medium text-secondary-foreground">
          {"Cannot find the answer you're looking for? Pubky support will help you out in no time."}
        </Typography>
        <Button id="support-btn" variant="secondary" size="default" onClick={handleSupportClick}>
          <Send size={16} />
          {'Support (Telegram)'}
        </Button>
      </Container>

      {/* Terms of Service & Privacy - Mobile only (hidden on lg screens where sidebar is visible) */}
      <Container overrideDefaults className="flex w-full flex-col items-start gap-6 lg:hidden">
        <SettingsDivider />
        <Container overrideDefaults className="flex w-full flex-col items-start gap-6">
          <Container overrideDefaults className="inline-flex items-center gap-3">
            <LockKeyhole size={24} />
            <Heading level={2} size="lg" className="leading-8">
              {'Terms of Service & Privacy'}
            </Heading>
          </Container>
          <Typography as="p" overrideDefaults className="text-base leading-6 font-medium text-secondary-foreground">
            {'Please read our terms carefully.'}
          </Typography>
          <Container overrideDefaults className="flex flex-wrap gap-2">
            <DialogTerms
              trigger={
                <Button id="tos-btn" variant="secondary" size="default">
                  <FileText size={16} />
                  {'Terms of service'}
                </Button>
              }
            />
            <DialogPrivacy
              trigger={
                <Button id="privacy-btn" variant="secondary" size="default">
                  <LockKeyhole size={16} />
                  {'Privacy policy'}
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
