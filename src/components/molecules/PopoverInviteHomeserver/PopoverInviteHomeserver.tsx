import * as Atoms from '@/atoms';
import * as Config from '@/config';
import { CircleHelp, Mail } from 'lucide-react';
import { XTwitter, Telegram } from '@/icons';
interface PopoverInviteHomeserverProps {
  className?: React.HTMLAttributes<HTMLDivElement>['className'];
}
export function PopoverInviteHomeserver({ className = 'hover:bg-brand/10' }: PopoverInviteHomeserverProps) {
  return (
    <Atoms.Popover hover>
      <Atoms.PopoverTrigger asChild>
        <Atoms.Button variant="ghost" size="icon" className={className}>
          <CircleHelp className="h-4 w-4 text-white" data-testid="circle-help-icon" />
        </Atoms.Button>
      </Atoms.PopoverTrigger>
      <Atoms.PopoverContent className="w-[327px]">
        <Atoms.Container className="flex-col gap-6 px-3 py-2">
          <Atoms.Container className="flex-col gap-2">
            <Atoms.Heading level={4} size="sm" className="text-popover-foreground">
              Don&apos;t have an invite yet?
            </Atoms.Heading>
            <Atoms.Typography size="sm" className="font-medium text-muted-foreground">
              Ask the Pubky team for your invite code to access the Pubky homeserver.
            </Atoms.Typography>
            <Atoms.Typography size="sm" className="font-medium text-muted-foreground">
              A homeserver is a storage provider that hosts your pubky-app-related data. Prefer to use another provider
              or host yourself? Support for custom homeservers is coming soon.
            </Atoms.Typography>
          </Atoms.Container>
          <Atoms.Container className="flex-row gap-4">
            <Atoms.Link href={Config.EMAIL_URL} className="text-muted-foreground hover:text-brand">
              <Mail className="h-6 w-6" />
            </Atoms.Link>
            <Atoms.Link href={Config.TWITTER_URL} className="text-muted-foreground hover:text-brand">
              <XTwitter className="h-6 w-6" />
            </Atoms.Link>
            <Atoms.Link href={Config.TELEGRAM_URL} className="text-muted-foreground hover:text-brand">
              <Telegram className="h-6 w-6" />
            </Atoms.Link>
          </Atoms.Container>
        </Atoms.Container>
      </Atoms.PopoverContent>
    </Atoms.Popover>
  );
}
