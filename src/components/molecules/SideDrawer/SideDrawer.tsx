'use client';

import { useLayoutEffect, useState } from 'react';
import { cn } from '@/libs/utils/utils';

export interface SideDrawerProps {
  open: boolean;
  onOpenChangeAction: (open: boolean) => void;
  children: React.ReactNode;
  position?: 'left' | 'right';
}

export function SideDrawer({ open, onOpenChangeAction, children, position = 'left' }: SideDrawerProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [isAnimating, setIsAnimating] = useState(false);

  useLayoutEffect(() => {
    if (open) {
      setIsVisible(true);
      // Start animation on next frame
      requestAnimationFrame(() => {
        setIsAnimating(true);
      });
      document.body.style.overflow = 'hidden';
    } else {
      setIsAnimating(false);
      // Wait for animation to complete before unmounting
      const timeout = setTimeout(() => {
        setIsVisible(false);
      }, 300); // Match transition duration
      document.body.style.overflow = '';
      return () => clearTimeout(timeout);
    }
  }, [open]);

  if (!isVisible) return null;

  const positionClasses = position === 'left' ? 'left-0 border-r border-border' : 'right-0 border-l border-border';

  const widthClasses =
    position === 'left' ? 'w-[228px] sm:w-[228px] md:w-[385px]' : 'w-[280px] sm:w-[280px] md:w-[385px]';

  const slideClasses =
    position === 'left'
      ? isAnimating
        ? 'translate-x-0'
        : '-translate-x-full'
      : isAnimating
        ? 'translate-x-0'
        : 'translate-x-full';

  return (
    <div className="fixed inset-0 z-50">
      {/* Backdrop */}
      <div
        className={cn(
          'absolute inset-0 bg-black transition-opacity duration-300',
          isAnimating ? 'opacity-70' : 'opacity-0',
        )}
        onClick={() => onOpenChangeAction(false)}
      />

      {/* Drawer */}
      <div
        className={cn(
          'fixed top-0 z-50 h-full',
          'bg-background p-4 shadow-xl sm:p-4 md:p-12',
          'transition-transform duration-300 ease-in-out',
          widthClasses,
          positionClasses,
          slideClasses,
        )}
      >
        <div className="h-full overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}
