'use client';

import * as Atoms from '@/atoms';
import { useTranslations } from 'next-intl';
import { CircleMinus, CirclePlus } from 'lucide-react';
interface ThreadExpandToggleProps {
  expanded: boolean;
  onToggle: () => void;
}

/**
 * ThreadExpandToggle Molecule
 *
 * A +/- toggle button that controls the visibility of sub-replies
 * for a single reply. Each reply with sub-replies gets its own toggle.
 *
 * Uses CirclePlus when collapsed and CircleMinus when expanded.
 */
export function ThreadExpandToggle({ expanded, onToggle }: ThreadExpandToggleProps) {
  const tThreadTree = useTranslations('common.threadTree');
  const Icon = expanded ? CircleMinus : CirclePlus;
  return (
    <Atoms.Button
      variant="ghost"
      size="icon"
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
      className="size-5 rounded-full bg-background p-0 text-muted-foreground hover:text-foreground"
      aria-label={expanded ? tThreadTree('collapseAllReplies') : tThreadTree('expandAllReplies')}
    >
      <Icon className="size-5" />
    </Atoms.Button>
  );
}
