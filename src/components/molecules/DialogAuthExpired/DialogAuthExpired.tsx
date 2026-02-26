'use client';

import * as Atoms from '@/atoms';
import * as Libs from '@/libs';
import type { DialogAuthExpiredProps } from './DialogAuthExpired.types';

export function DialogAuthExpired({ open, onRefresh }: DialogAuthExpiredProps) {
  return (
    <Atoms.Dialog open={open}>
      <Atoms.DialogContent showCloseButton={false} hiddenTitle="Connection expired">
        <Atoms.DialogHeader>
          <Atoms.DialogTitle>Connection expired</Atoms.DialogTitle>
        </Atoms.DialogHeader>
        <Atoms.Typography className="text-base tracking-wide text-white/80">
          The relay connection timed out. Refresh to generate a new QR code.
        </Atoms.Typography>
        <Atoms.DialogFooter>
          <Atoms.Button size="lg" onClick={onRefresh}>
            <Libs.RefreshCw className="mr-2 h-4 w-4" />
            Refresh
          </Atoms.Button>
        </Atoms.DialogFooter>
      </Atoms.DialogContent>
    </Atoms.Dialog>
  );
}
