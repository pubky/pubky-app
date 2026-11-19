'use client';

import { useState } from 'react';
import { CircleCheck, X } from 'lucide-react';
import { Button, ButtonVariant } from '@/atoms/Button/Button';
import { Container } from '@/atoms/Container/Container';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/atoms/Dialog/Dialog';
import { Heading } from '@/atoms/Heading/Heading';
import { Typography } from '@/atoms/Typography/Typography';
import { LOCKS_ACCESS_ROWS } from './LocksEnabledCard.constants';
import type { LocksAccessRow, LocksEnabledCardProps } from './LocksEnabledCard.types';

export function LocksEnabledCard({ onRecheck }: LocksEnabledCardProps) {
  // The row stays set while the dialog closes, so its text does not blank out during the exit animation.
  const [dialogRow, setDialogRow] = useState<LocksAccessRow>(LOCKS_ACCESS_ROWS[0]);
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const openDialog = (row: LocksAccessRow) => {
    setDialogRow(row);
    setIsDialogOpen(true);
  };

  const confirm = () => {
    setIsDialogOpen(false);
    onRecheck();
  };

  return (
    <>
      <Heading level={3} className="text-xl leading-7">
        {'Locks enabled'}
      </Heading>
      <Container overrideDefaults className="flex w-full flex-col gap-4">
        {LOCKS_ACCESS_ROWS.map((row) => (
          <Container
            key={row.id}
            overrideDefaults
            className="flex w-full flex-wrap items-center justify-between gap-3"
            data-testid={`locks-access-${row.id}`}
          >
            <Container overrideDefaults className="flex items-center gap-2 text-brand">
              <CircleCheck className="size-5 shrink-0" aria-hidden />
              <Typography overrideDefaults className="text-base font-bold">
                {row.label}
              </Typography>
            </Container>
            <Button variant={ButtonVariant.OUTLINE} size="sm" onClick={() => openDialog(row)}>
              <X aria-hidden />
              {row.action}
            </Button>
          </Container>
        ))}
      </Container>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{dialogRow.dialogTitle}</DialogTitle>
            <DialogDescription className="text-base text-secondary-foreground">
              {dialogRow.dialogText}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant={ButtonVariant.OUTLINE} size="lg" className="w-full" onClick={confirm}>
              {'OK'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
