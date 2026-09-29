import { CircleHelp } from 'lucide-react';
import { Button } from '@/atoms/Button/Button';
import { Container } from '@/atoms/Container/Container';
import { Heading } from '@/atoms/Heading/Heading';
import { Link } from '@/atoms/Link/Link';
import { Popover, PopoverContent, PopoverTrigger } from '@/atoms/Popover/Popover';
import { Typography } from '@/atoms/Typography/Typography';
import { cn } from '@/libs/utils/utils';

const PASSPORT_README_URL = 'https://github.com/pubky/pubky-passport/blob/main/README.md';

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

/**
 * PopoverGoogleSignIn
 *
 * Help popover behind the "Continue with Google" pill: what Google does, where the keys live, and
 * why neither Google nor Passport can recover an account alone. Opens on click (and Enter/Space)
 * rather than hover, so an icon-only trigger stays reachable by keyboard, and on touch devices.
 */
export function PopoverGoogleSignIn({ className }: { className?: string }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label="About signing in with Google"
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
            {'Continue with Google, powered by Pubky Passport.'}
          </Heading>
          <ul className="list-inside list-disc text-sm font-medium text-muted-foreground">
            {POINTS.map((point) => (
              <li key={point.term}>
                <Typography as="strong" size="sm" className="font-semibold text-secondary-foreground">
                  {point.term}
                </Typography>
                {` ${point.text}`}
              </li>
            ))}
          </ul>
          <Link href={PASSPORT_README_URL} className="font-semibold">
            {'Learn more'}
          </Link>
        </Container>
      </PopoverContent>
    </Popover>
  );
}
