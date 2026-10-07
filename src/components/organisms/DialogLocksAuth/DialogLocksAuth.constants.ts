// Shared with `LocksPermissionNotice`, and kept out of `DialogLocksAuth.tsx`: the notice renders in
// every locked feed post and must not pull the creator flow (Lock Server, Paykit) into that bundle.

// `overrideDefaults` drops the atom's own background/border so these win cleanly.
export const LOCKS_DIALOG_CARD_CLASSNAME =
  'flex max-h-[calc(100dvh-2rem)] w-full max-w-[100vw] flex-col gap-6 overflow-y-auto rounded-xl border-y border-brand bg-card p-8 shadow-2xl outline-none sm:max-w-xl';

// Radix auto-focuses Cancel, whose programmatic focus trips :focus-visible → a 3px ring that reads
// as a thick border. Focusing the panel keeps focus trapped with no ring; Tab still rings buttons.
export const focusLocksDialogPanel = (event: Event) => {
  event.preventDefault();
  (event.currentTarget as HTMLElement | null)?.focus();
};

// Figma's tracking for the authorization steps' body copy. One definition, so the dialog step and the
// reader notice cannot drift apart.
export const LOCKS_DIALOG_DESCRIPTION_TRACKING = 'tracking-[-0.5px]';
export const LOCKS_DIALOG_DESCRIPTION_CLASSNAME = `text-base ${LOCKS_DIALOG_DESCRIPTION_TRACKING} text-secondary-foreground`;
