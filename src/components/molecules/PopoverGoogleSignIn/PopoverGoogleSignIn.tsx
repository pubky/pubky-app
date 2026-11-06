import { CircleHelp } from 'lucide-react';
import { Button } from '@/atoms/Button/Button';
import { Container } from '@/atoms/Container/Container';
import { Heading } from '@/atoms/Heading/Heading';
import { Popover, PopoverContent, PopoverTrigger } from '@/atoms/Popover/Popover';
import { Typography } from '@/atoms/Typography/Typography';
import { isPassportAppleEnabled } from '@/config/network';
import { cn } from '@/libs/utils/utils';

const POINTS = [
  {
    term: "Google's role:",
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

/** The same four points when Passport also offers Apple: the person picks the account in Passport. */
const POINTS_WITH_APPLE = [
  {
    term: "Your account's role:",
    text: 'Your Google or Apple account helps identify you and securely retrieve your encrypted backup. It does not create or control your pubky.',
  },
  {
    term: 'Your keys:',
    text: 'Keys are created in your browser and encrypted before storage on Google Drive or in iCloud. Google and Apple never see the private key.',
  },
  {
    term: 'Recovery:',
    text: 'Recovery requires both your encrypted backup and a separate recovery key from Passport.',
  },
  {
    term: 'Split security:',
    text: 'Neither your account provider nor Passport can recover your pubky on its own, reducing reliance on either one.',
  },
];

/**
 * PopoverGoogleSignIn
 *
 * Help popover behind the Passport pill: what the account provider does, where the keys live, and
 * why neither the provider nor Passport can recover an account alone. It names Google, or Google or
 * Apple when the deploy's Passport offers Apple (`isPassportAppleEnabled`). Opens on click (and
 * Enter/Space) rather than hover, so an icon-only trigger stays reachable by keyboard, and on touch
 * devices.
 */
export function PopoverGoogleSignIn({ className }: { className?: string }) {
  const withApple = isPassportAppleEnabled();
  const points = withApple ? POINTS_WITH_APPLE : POINTS;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label={withApple ? 'About signing in with Passport' : 'About signing in with Google'}
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
            {withApple
              ? 'Continue with Passport, sign in with Google or Apple.'
              : 'Continue with Google, powered by Pubky Passport.'}
          </Heading>
          {points.map((point) => (
            <Typography key={point.term} size="sm" className="text-muted-foreground">
              <Typography as="strong" size="sm" className="font-semibold text-secondary-foreground">
                {point.term}
              </Typography>
              {` ${point.text}`}
            </Typography>
          ))}
        </Container>
      </PopoverContent>
    </Popover>
  );
}
