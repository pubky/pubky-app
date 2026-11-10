import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PopoverGoogleSignIn } from './PopoverGoogleSignIn';

const mockAppleEnabled = vi.hoisted(() => vi.fn(() => false));
vi.mock('@/config/network', () => ({ isPassportAppleEnabled: mockAppleEnabled }));
beforeEach(() => mockAppleEnabled.mockReturnValue(false));

const PASSPORT_README_URL = 'https://github.com/pubky/pubky-passport/blob/main/README.md';

// Figma help design (47458:207555): Google text with the flag off.
const GOOGLE_POINTS = [
  [
    'Google’s role:',
    'Helps identify you and securely retrieve your encrypted backup. It does not create or control your pubky.',
  ],
  [
    'Your keys:',
    'Keys are created in your browser and encrypted before storage on Google Drive. Google never sees the private key.',
  ],
  ['Recovery:', 'Recovery requires both your encrypted Google Drive backup and a separate recovery key from Passport.'],
  [
    'Split security:',
    'Neither Google nor Passport can recover your pubky on its own, reducing reliance on either one.',
  ],
];

// Same structure, provider-neutral wording from pubky/pubky-passport#278, with the flag on.
const PROVIDER_POINTS = [
  [
    'Your provider:',
    'Your account provider helps you sign in and find your encrypted backup. It does not create or control your pubky.',
  ],
  ['Your keys:', 'Your keys are created in your browser and encrypted before they are saved in your cloud storage.'],
  ['Recovery:', 'When you sign in, Passport retrieves your encrypted backup and the separate key needed to unlock it.'],
  ['Split security:', 'Your encrypted backup and the key that unlocks it are stored separately.'],
];

function openHelp(label: string) {
  render(<PopoverGoogleSignIn />);
  fireEvent.click(screen.getByRole('button', { name: label }));
  return screen.getByRole('dialog');
}

function expectFigmaStructure(dialog: HTMLElement, titleFirstLine: string, points: string[][]) {
  const heading = screen.getByRole('heading', { name: `${titleFirstLine} powered by Pubky Passport.` });
  // Two title lines, as in the Figma help design.
  expect(Array.from(heading.children, (line) => line.textContent)).toEqual([
    titleFirstLine,
    'powered by Pubky Passport.',
  ]);
  const paragraphs = Array.from(dialog.querySelectorAll('p')).filter((p) => p.querySelector('strong'));
  expect(paragraphs.map((p) => [p.querySelector('strong')!.textContent, p.textContent])).toEqual(
    points.map(([term, text]) => [term, `${term} ${text}`]),
  );
  // The points read as separate paragraphs, never as a bulleted list.
  expect(screen.queryByRole('list')).not.toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Learn more' })).toHaveAttribute('href', PASSPORT_README_URL);
}

describe('PopoverGoogleSignIn', () => {
  it('shows the Figma Google help with the Apple flag off', () => {
    const dialog = openHelp('About signing in with Google');
    expectFigmaStructure(dialog, 'Continue with Google,', GOOGLE_POINTS);
    expect(dialog.textContent).not.toMatch(/Apple|iCloud/);
  });

  it('shows the same structure with provider-neutral copy with the Apple flag on', () => {
    mockAppleEnabled.mockReturnValue(true);
    const dialog = openHelp('About signing in with Apple or Google');
    expectFigmaStructure(dialog, 'Continue with your account,', PROVIDER_POINTS);
    expect(dialog.textContent).not.toMatch(/Apple|iCloud|Google/);
  });
});
