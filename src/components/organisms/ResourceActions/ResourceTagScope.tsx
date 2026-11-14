'use client';

import { CalendarDays, Check, ChevronDown, type LucideIcon, Repeat } from 'lucide-react';
import { Button } from '@/atoms/Button/Button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/atoms/DropdownMenu/DropdownMenu';
import { Typography } from '@/atoms/Typography/Typography';
import { cn } from '@/libs/utils/utils';

/** Whose tags a series date's tag bar shows and writes: the date's own, or its feed's (all dates). */
export type TTagScope = 'date' | 'all';

const SCOPES: readonly { value: TTagScope; label: string; icon: LucideIcon }[] = [
  { value: 'date', label: 'This date', icon: CalendarDays },
  { value: 'all', label: 'All dates', icon: Repeat },
];

interface ResourceTagScopeProps {
  scope: TTagScope;
  onScopeChange: (scope: TTagScope) => void;
}

/**
 * The one-of-two choice at the start of a series date's tag bar: "This date ▾" or "All dates ▾",
 * opening the post menu's style of list with a check on the current one (as the composer's embedded
 * link switch). Its name says only one applies and which; each row's says whether it is the one shown.
 */
export function ResourceTagScope({ scope, onScopeChange }: ResourceTagScopeProps) {
  const current = SCOPES.find((option) => option.value === scope) ?? SCOPES[0];
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          aria-label={`Tags for this date or for all dates: ${current.label}`}
          data-testid="resource-tag-scope"
          className="shrink-0 border-foreground/30 bg-background text-foreground hover:border-foreground/50 hover:bg-background/60 data-[state=open]:border-foreground/50"
        >
          {current.label}
          <ChevronDown className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="flex w-56 flex-col gap-2.5" data-testid="resource-tag-scope-menu">
        {SCOPES.map(({ value, label, icon: Icon }) => {
          const isCurrent = value === scope;
          return (
            <DropdownMenuItem
              key={value}
              onSelect={() => onScopeChange(value)}
              aria-label={isCurrent ? `${label} (shown)` : `Show tags for ${label.toLowerCase()}`}
              className="group gap-2 p-0"
            >
              <Icon
                className={cn(
                  'size-4 shrink-0 transition-colors group-hover:text-foreground',
                  isCurrent ? 'text-foreground' : 'text-muted-foreground',
                )}
              />
              <Typography
                as="span"
                overrideDefaults
                className={cn(
                  'min-w-0 flex-1 truncate text-base font-medium transition-colors group-hover:text-foreground',
                  isCurrent ? 'text-foreground' : 'text-muted-foreground',
                )}
              >
                {label}
              </Typography>
              {isCurrent && <Check aria-hidden="true" className="size-4 shrink-0 text-brand" />}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
