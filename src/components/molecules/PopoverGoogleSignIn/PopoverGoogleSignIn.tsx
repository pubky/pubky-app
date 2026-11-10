import { CircleHelp } from 'lucide-react';
import { Button } from '@/atoms/Button/Button';
import { Container } from '@/atoms/Container/Container';
import { Heading } from '@/atoms/Heading/Heading';
import { Link } from '@/atoms/Link/Link';
import { Popover, PopoverContent, PopoverTrigger } from '@/atoms/Popover/Popover';
import { Typography } from '@/atoms/Typography/Typography';
import { isPassportAppleEnabled } from '@/config/network';
import { cn } from '@/libs/utils/utils';

const PASSPORT_README_URL = 'https://github.com/pubky/pubky-passport/blob/main/README.md';

type HelpPoint = { term: string; text: string };

// Figma help design (Pubky-SHADCN 47458:207555): "Continue with <X>," / "powered by Pubky Passport."
// and four labelled points.

// Provider-neutral wording shared with pubky/pubky-passport#278 (`ACCOUNT_HELP_POINTS`).
const PROVIDER_POINTS: HelpPoint[] = [
  {
    term: 'Your provider:',
    text: 'Your account provider helps you sign in and find your encrypted backup. It does not create or control your pubky.',
  },
  {
    term: 'Your keys:',
    text: 'Your keys are created in your browser and encrypted before they are saved in your cloud storage.',
  },
  {
    term: 'Recovery:',
    text: 'When you sign in, Passport retrieves your encrypted backup and the separate key needed to unlock it.',
  },
  {
    term: 'Split security:',
    text: 'Your encrypted backup and the key that unlocks it are stored separately.',
  },
];

const GOOGLE_POINTS: HelpPoint[] = [
  {
    term: 'Google’s role:',
    text: 'Helps identify you and securely retrieve your encrypted backup. It does not create or control your pubky.',
  },
  {
    term: 'Your keys:',
    text: 'Keys are created in your browser and encrypted before storage on Google Drive. Google never sees the private key.',
  },
  {
    term: 'Recovery:',
    text: 'Recovery requires both your encrypted Google Drive backup and a separate recovery key from Passport.',
  },
  {
    term: 'Split security:',
    text: 'Neither Google nor Passport can recover your pubky on its own, reducing reliance on either one.',
  },
];

/**
 * PopoverGoogleSignIn
 *
 * Help popover for Passport sign-in: what the account provider does, where the keys live,
 * and what recovery requires. Google-only copy by default; provider-neutral copy when Apple is
 * enabled. Opens on click (and Enter/Space) rather than hover, so an icon-only trigger stays
 * reachable by keyboard, and on touch devices.
 */
export function PopoverGoogleSignIn({ className }: { className?: string }) {
  const appleEnabled = isPassportAppleEnabled();
  const points = appleEnabled ? PROVIDER_POINTS : GOOGLE_POINTS;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label={appleEnabled ? 'About signing in with Apple or Google' : 'About signing in with Google'}
          data-cy="passport-google-help-btn"
          className={cn(
            'size-8 text-secondary-foreground/70 hover:bg-secondary-foreground/10 hover:text-foreground',
            className,
          )}
        >
          <CircleHelp className="size-4" data-testid="circle-help-icon" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-6">
        <Container className="gap-4">
          <Heading level={4} size="sm" className="text-popover-foreground">
            <span className="block">{appleEnabled ? 'Continue with your account,' : 'Continue with Google,'}</span>{' '}
            <span className="block">{'powered by Pubky Passport.'}</span>
          </Heading>
          {points.map((point) => (
            <Typography key={point.term} size="sm" className="text-muted-foreground">
              <Typography as="strong" size="sm" className="font-semibold text-secondary-foreground">
                {point.term}
              </Typography>
              {` ${point.text}`}
            </Typography>
          ))}
          <Link href={PASSPORT_README_URL} className="font-semibold">
            {'Learn more'}
          </Link>
        </Container>
      </PopoverContent>
    </Popover>
  );
}
