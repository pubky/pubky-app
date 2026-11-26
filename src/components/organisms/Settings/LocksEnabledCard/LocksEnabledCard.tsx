'use client';

import { CircleCheckBig, X } from 'lucide-react';
import { Button, ButtonVariant } from '@/atoms/Button/Button';
import { Container } from '@/atoms/Container/Container';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/atoms/Dialog/Dialog';
import { Heading } from '@/atoms/Heading/Heading';
import { Typography } from '@/atoms/Typography/Typography';
import { LOCKS_ACCESS_ROWS } from './LocksEnabledCard.constants';
import type { LocksEnabledCardProps } from './LocksEnabledCard.types';

export function LocksEnabledCard({ onRecheck }: LocksEnabledCardProps) {
  return (
    <Container overrideDefaults className="flex w-full flex-col gap-4 md:gap-6">
      {/* Figma v28: a label in the mobile layout, a heading from `lg`. */}
      <Heading
        level={3}
        className="text-xs leading-4 font-medium tracking-widest text-muted-foreground uppercase lg:text-xl lg:leading-7 lg:font-semibold lg:tracking-normal lg:text-foreground lg:normal-case"
      >
        {'Locks enabled'}
      </Heading>
      <Container overrideDefaults className="flex w-full flex-col gap-6 md:gap-3">
        {LOCKS_ACCESS_ROWS.map((row) => (
          <Container
            key={row.id}
            overrideDefaults
            className="flex w-full flex-col items-start gap-2 md:flex-row"
            data-testid={`locks-access-${row.id}`}
          >
            <Container overrideDefaults className="flex flex-col gap-2 text-brand md:min-w-0 md:flex-1 md:flex-row">
              <CircleCheckBig className="size-6 shrink-0" aria-hidden />
              <Typography overrideDefaults className="text-base font-bold">
                {row.label}
              </Typography>
            </Container>
            <Dialog>
              <DialogTrigger asChild>
                <Button variant={ButtonVariant.OUTLINE} size="sm">
                  <X aria-hidden />
                  {row.action}
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-xl">
                <DialogHeader>
                  <DialogTitle>{row.dialogTitle}</DialogTitle>
                  <DialogDescription className="text-base text-secondary-foreground">
                    {row.dialogText}
                  </DialogDescription>
                </DialogHeader>
                <DialogFooter>
                  <DialogClose asChild>
                    <Button variant={ButtonVariant.OUTLINE} size="lg" className="w-full" onClick={onRecheck}>
                      {'OK'}
                    </Button>
                  </DialogClose>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </Container>
        ))}
      </Container>
    </Container>
  );
}
