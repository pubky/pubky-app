'use client';

import * as Atoms from '@/atoms';
import * as Libs from '@/libs';
import { useTranslations } from 'next-intl';
import type { ShowMoreRepliesProps } from './ShowMoreReplies.types';

/**
 * ShowMoreReplies Molecule
 *
 * Displays a "+N more replies" button with a thread connector on the left.
 * Maps to the Figma component `Pubky / Replies / More`.
 *
 * Uses an inline connector layout that flexes naturally with the button
 * height, avoiding the fixed-height measurement that inflates the row.
 */
export function ShowMoreReplies({ count, onClick, isLast = false }: ShowMoreRepliesProps) {
  const tThreadTree = useTranslations('common.threadTree');

  return (
    <Atoms.Container overrideDefaults>
      <Atoms.PostThreadSpacer />
      <Atoms.Container overrideDefaults className="relative flex min-w-0">
        {/* Thread connector column — stretches to match button height via flex row */}
        {isLast ? (
          <Atoms.Container overrideDefaults className="flex w-3 shrink-0 flex-col items-start" data-variant="last">
            {/* Top half: vertical line + rounded corner */}
            <Atoms.Container
              overrideDefaults
              className="flex min-h-px w-full min-w-px shrink-0 grow basis-0 flex-col items-start"
            >
              {/* Vertical line above the corner */}
              <Atoms.Container
                overrideDefaults
                className="min-h-px w-full min-w-px shrink-0 grow basis-0 border-l border-border"
              />
              {/* Rounded corner */}
              <Atoms.Container overrideDefaults className="relative size-3 shrink-0">
                <Libs.RoundedCorner />
              </Atoms.Container>
            </Atoms.Container>
            {/* Bottom half: empty spacer (no border — line does not continue) */}
            <Atoms.Container overrideDefaults className="min-h-px w-3 min-w-px shrink-0 grow basis-0" />
          </Atoms.Container>
        ) : (
          <Atoms.Container
            overrideDefaults
            className="flex w-3 shrink-0 flex-col items-start border-l border-border"
            data-variant="regular"
          >
            <Atoms.Container
              overrideDefaults
              className="flex min-h-px min-w-3 shrink-0 grow basis-0 flex-col items-start"
            >
              {/* Space above the corner */}
              <Atoms.Container overrideDefaults className="min-h-px w-full min-w-px shrink-0 grow basis-0" />
              {/* Rounded corner */}
              <Atoms.Container overrideDefaults className="relative size-3 shrink-0">
                <Libs.RoundedCorner />
              </Atoms.Container>
            </Atoms.Container>
            {/* Space below — line continues */}
            <Atoms.Container overrideDefaults className="min-h-px w-3 min-w-px shrink-0 grow basis-0" />
          </Atoms.Container>
        )}
        {/* Button content — determines the actual row height */}
        <Atoms.Container overrideDefaults className="flex-1">
          <Atoms.Button
            variant="ghost"
            size="sm"
            type="button"
            onClick={onClick}
            className="gap-2 rounded-full px-3.5 py-2 text-xs font-bold text-foreground"
          >
            <Libs.CirclePlus className="size-6" />
            <span>{tThreadTree('moreReplies', { count })}</span>
          </Atoms.Button>
        </Atoms.Container>
      </Atoms.Container>
    </Atoms.Container>
  );
}
