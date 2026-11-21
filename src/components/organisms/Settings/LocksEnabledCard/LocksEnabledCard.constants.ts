import type { LocksAccessRow } from './LocksEnabledCard.types';

// pubky.app cannot remove these grants itself (that needs a root session), so each button only tells the
// creator where to do it.
export const LOCKS_ACCESS_ROWS: LocksAccessRow[] = [
  {
    id: 'lock-server',
    label: 'Authorized the Locks server',
    action: 'Revoke access',
    dialogTitle: 'Revoke Locks server access',
    dialogText:
      'To prevent the Locks server from reading or updating your Locks data, open Pubky Ring, select your pubky, tap locks.paykit.app, and select Revoke app access. Existing locks will remain, but locked content may stop working until access is restored.',
  },
  {
    id: 'bitkit',
    label: 'Linked Bitkit wallet to enable payments',
    action: 'Disconnect Bitkit',
    dialogTitle: 'Disconnect Bitkit?',
    // TODO:[Locks] #2984 — final text pending with design: "Unlink pubky" does not stop Locks payments.
    dialogText:
      "To stop Bitkit from generating payment addresses through Paykit and unlink your pubky, open Bitkit, go to your profile, tap edit, scroll down, and tap 'Unlink pubky'. Previously shared activity may remain visible.",
  },
];
