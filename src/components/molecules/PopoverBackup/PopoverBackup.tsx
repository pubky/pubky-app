import { Button } from '@/atoms/Button/Button';
import { Container } from '@/atoms/Container/Container';
import { Heading } from '@/atoms/Heading/Heading';
import { Popover, PopoverContent, PopoverTrigger } from '@/atoms/Popover/Popover';
import { Typography } from '@/atoms/Typography/Typography';

import { CircleHelp } from 'lucide-react';
import { cn } from '@/libs/utils/utils';
export function PopoverBackup({ ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <Popover hover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className={cn('hover:bg-white/10', props.className)}>
          <CircleHelp className="h-4 w-4 text-white" data-testid="circle-help-icon" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[327px] p-6">
        <Container className="gap-2">
          <Heading level={4} size="sm" className="text-popover-foreground">
            Why is this important?
          </Heading>
          <Typography size="sm" className="leading-light text-sm font-medium text-muted-foreground">
            The secret seed for your pubky is like a master password. Anyone with access can take full control of your
            account. You are responsible for keeping your keys safe.
          </Typography>
        </Container>
      </PopoverContent>
    </Popover>
  );
}
