/**
 * Dashed-outline grid CTA tile styling shared by collection grid CTAs (e.g.
 * `NewCollectionCardCTA`, Add Content grid trigger). Uses `h-full` grid stretch:
 * grows to match a taller sibling in the same row, never imposes a min-height on
 * neighbours.
 */
export const GRID_DASHED_CTA_TRIGGER_CLASS =
  'flex h-full w-full cursor-pointer items-center justify-center gap-2 rounded-md border border-dashed border-input p-6 text-foreground transition-colors outline-none hover:border-foreground focus:outline-none focus-visible:ring-0 focus-visible:outline-none';

export const GRID_DASHED_CTA_WRAPPER_CLASS = 'block h-full w-full';
