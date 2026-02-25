import type { FAQSection } from './HelpContent.types';

export const FAQ_SECTIONS: FAQSection[] = [
  {
    id: 'onboarding',
    title: '1. Getting Started & Onboarding',
    questions: [
      {
        id: '1',
        question: 'Why does Pubky require invite codes?',
        answer:
          "Pubky uses invite codes as a temporary measure to prevent spam and server overload. Users need an invite code to create a user on our Homeserver. We don't create a user for the Pubky App, but on our Homeserver. As the infrastructure improves and more homeservers come online, invite codes may no longer be necessary.",
      },
      {
        id: '2',
        question: 'How do I use Pubky Ring with the web app?',
        answer:
          'First, create your keypair in the Pubky Ring app. Then visit the Pubky web app and log in using the same keypair. The apps are connected through your cryptographic identity.',
      },
      {
        id: '3',
        question: 'Why does login sometimes fail when using the PWA on Android?',
        answer: `Some browsers focused on security and privacy, like Vanadium or Tor, disable Just-In-Time (JIT) compilation for JavaScript by default, which prevents Pubky App from functioning properly.

To enable it, go to: Settings > Site settings > JavaScript JIT > Allowed.`,
      },
    ],
  },
  {
    id: 'backup',
    title: '2. Backups & Account Recovery',
    questions: [
      {
        id: '4',
        question: 'How can I restore my account?',
        answer: `When you signed up, you were prompted to back up your identity using one of the following:

- Recovery file (.pkarr)
- Recovery phrase (mnemonic)
- QR code

To restore with a .pkarr file:

1. Select the file you saved.
2. Enter your password.
3. Click "Sign In".`,
      },
      {
        id: '5',
        question: 'Can I restore my Pubky account on another device?',
        answer:
          'Yes, if you have your .pkarr file or seed phrase. (Seed phrase support will be added in future versions of Pubky Ring.)',
      },
      {
        id: '6',
        question: 'Can I convert a seed phrase into a .pkarr file later?',
        answer: 'Not yet. This functionality is planned for a future update.',
      },
      {
        id: '7',
        question: "I backed up my account but can't access the file. What happened?",
        answer:
          'Some operating systems may rename the .pkarr file or mislabel it. Try renaming the file extension to .pkarr and reimporting.',
      },
      {
        id: '8',
        question: 'I downloaded a .txt file instead of a .pkarr backup. What do I do?',
        answer:
          'This happens if you chose the mnemonic (seed phrase) backup option. Pubky Ring does not yet support seed import. Wait for future updates or recreate your account with a .pkarr backup.',
      },
      {
        id: '9',
        question: 'I missed downloading the recovery file. Can I back up again?',
        answer: 'Currently, backups can only be created once via the web app. This may change in future updates.',
      },
    ],
  },
  {
    id: 'profile',
    title: '3. Profile & Social Features',
    questions: [
      {
        id: '10',
        question: 'How can I update my profile information?',
        answer: 'Click your avatar (top-right corner), then click "Edit" to update your profile info.',
      },
      {
        id: '11',
        question: 'How can I delete my post?',
        answer: 'Hover over the three dots on the post you wish to delete and select "Delete Post".',
      },
      {
        id: '12',
        question: 'How do I mute someone?',
        answer: 'Go to their profile, click the three dots, and choose "Mute User".',
      },
    ],
  },
  {
    id: 'pubky',
    title: '4. How Pubky App Works',
    questions: [
      {
        id: '13',
        question: 'How is Pubky different from other social media platforms?',
        answer: `Pubky is built for self-sovereign, decentralized social interaction. Key differences:

- You are the algorithm: customize what you see with semantic tags and curation.
- No email or phone required: your identity is your public key.
- Full control over your social graph via tagging and trust models.
- Browser-based PWA that respects privacy.`,
      },
      {
        id: '14',
        question: 'How does Pubky differ from Nostr?',
        answer:
          'Pubky uses Ed25519 keys for compatibility and avoids centralized relays. Instead, it uses a Distributed Hash Table (DHT) for decentralized lookup and identity resolution.',
      },
    ],
  },
];

export const SUPPORT_LINKS = {
  userGuide: 'https://support.synonym.to/hc/pubky-app-help-center/en',
  telegram: 'https://t.me/pubkychat',
} as const;
