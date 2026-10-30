import { LEGAL_ENTITY_NAME } from '@/config/legal';

export const FAQ_QUESTIONS = [
  'How can I update my profile information?',
  'How can I delete my post?',
  'How do I mute someone?',
] as const;

export const COPYRIGHT_TEXT = `© ${new Date().getFullYear()} ${LEGAL_ENTITY_NAME}`;
