import { CircleHelp, Mail } from 'lucide-react';
import { Button } from '@/atoms/Button/Button';
import { Container } from '@/atoms/Container/Container';
import { Heading } from '@/atoms/Heading/Heading';
import { Link } from '@/atoms/Link/Link';
import { Popover, PopoverContent, PopoverTrigger } from '@/atoms/Popover/Popover';
import { Typography } from '@/atoms/Typography/Typography';
import { getEmailLink, getTelegramLink, getTwitterLink } from '@/config/externalLinks';
import { Telegram, XTwitter } from '@/icons';

interface PopoverInviteHomeserverProps {
  className?: React.HTMLAttributes<HTMLDivElement>['className'];
}
export function PopoverInviteHomeserver({ className = 'hover:bg-brand/10' }: PopoverInviteHomeserverProps) {
  return (
    <Popover hover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className={className}>
          <CircleHelp className="h-4 w-4 text-white" data-testid="circle-help-icon" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[327px]">
        <Container className="flex-col gap-6 px-3 py-2">
          <Container className="flex-col gap-2">
            <Heading level={4} size="sm" className="text-popover-foreground">
              Don&apos;t have an invite yet?
            </Heading>
            <Typography size="sm" className="font-medium text-muted-foreground">
              Ask the Pubky team for your invite code to access the Pubky homeserver.
            </Typography>
            <Typography size="sm" className="font-medium text-muted-foreground">
              A homeserver is a storage provider that hosts your pubky-app-related data. Prefer to use another provider
              or host yourself? Support for custom homeservers is coming soon.
            </Typography>
          </Container>
          <Container className="flex-row gap-4">
            <Link href={getEmailLink()} className="text-muted-foreground hover:text-brand">
              <Mail className="h-6 w-6" />
            </Link>
            <Link href={getTwitterLink()} className="text-muted-foreground hover:text-brand">
              <XTwitter className="h-6 w-6" />
            </Link>
            <Link href={getTelegramLink()} className="text-muted-foreground hover:text-brand">
              <Telegram className="h-6 w-6" />
            </Link>
          </Container>
        </Container>
      </PopoverContent>
    </Popover>
  );
}
