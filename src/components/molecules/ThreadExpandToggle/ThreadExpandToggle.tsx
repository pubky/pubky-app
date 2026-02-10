'use client';

import * as Atoms from '@/atoms';
import * as Hooks from '@/hooks';
import * as Libs from '@/libs';
import { useTranslations } from 'next-intl';

/**
 * ThreadExpandToggle Molecule
 *
 * A global +/- toggle button that controls the visibility of all Level 2
 * sub-reply sections within a ThreadTree.
 *
 * Uses CirclePlus when collapsed and CircleMinus when expanded.
 * Reads and writes `allLevel2Expanded` from ThreadTreeContext.
 */
export function ThreadExpandToggle() {
  const tThreadTree = useTranslations('common.threadTree');
  const { allLevel2Expanded, toggleAllLevel2 } = Hooks.useThreadTreeContext();

  const Icon = allLevel2Expanded ? Libs.CircleMinus : Libs.CirclePlus;

  return (
    <Atoms.Button
      variant="ghost"
      size="icon"
      onClick={toggleAllLevel2}
      className="size-5 rounded-full bg-background p-0 text-muted-foreground hover:text-foreground"
      aria-label={allLevel2Expanded ? tThreadTree('collapseAllReplies') : tThreadTree('expandAllReplies')}
    >
      <Icon className="size-5" />
    </Atoms.Button>
  );
}
