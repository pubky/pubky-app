'use client';

import * as Atoms from '@/atoms';
import * as Hooks from '@/hooks';
import * as Libs from '@/libs';

export interface ScrollToTopFabProps {
  /** Number of pixels from top to show the button */
  threshold?: number;
  className?: string;
}

export function ScrollToTopFab({ threshold = 400, className }: ScrollToTopFabProps) {
  const isScrolled = Hooks.useIsScrolledFromTop(threshold);

  if (!isScrolled) return null;

  return (
    <Atoms.Button
      type="button"
      variant="secondary"
      size="icon"
      aria-label="Scroll to top"
      data-testid="scroll-to-top-fab"
      className={Libs.cn(
        // Desktop-only: mobile already has quick scroll-to-top via logo/home button
        'hidden lg:inline-flex',
        'fixed bottom-[72px] left-3 sm:left-10 md:bottom-20 lg:bottom-6 lg:left-6',
        'z-40 size-12 border border-white/10 bg-white/8 shadow-lg backdrop-blur-md',
        className,
      )}
      onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
    >
      <Libs.ArrowUp className="size-6" />
    </Atoms.Button>
  );
}
