import { Check, Lock } from 'lucide-react';

interface LockAccessLabelProps {
  /** The signed-in user created the lock, rather than unlocked someone else's. */
  isOwnLock: boolean;
}

export function LockAccessLabel({ isOwnLock }: LockAccessLabelProps) {
  const Icon = isOwnLock ? Lock : Check;
  return (
    <div className="flex items-center gap-1 text-brand">
      <Icon className="size-4 shrink-0" aria-hidden />
      <span className="text-xs leading-4 font-medium tracking-[1.2px] uppercase" data-cy="locked-post-access-label">
        {isOwnLock ? 'My locked content' : 'Unlocked'}
      </span>
    </div>
  );
}
