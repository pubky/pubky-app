'use client';

import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { Popover as PopoverPrimitive } from 'radix-ui';
import { useIsTouchDevice } from '@/hooks/useIsTouchDevice/useIsTouchDevice';
import { cn } from '@/libs/utils/utils';
import { DEFAULT_HOVER_CLOSE_DELAY } from './Popover.constants';
import type { PopoverContextType, PopoverProps } from './Popover.types';

const PopoverContext = createContext<PopoverContextType>({});

function Popover({
  open,
  onOpenChange,
  hover = false,
  hoverDelay = 0,
  hoverCloseDelay = DEFAULT_HOVER_CLOSE_DELAY,
  children,
  ...props
}: PopoverProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const openTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isTouchDevice = useIsTouchDevice();
  const isControlled = open !== undefined;
  const isOpen = isControlled ? open : internalOpen;
  const handleOpenChange = isControlled ? onOpenChange : setInternalOpen;

  // Disable hover on touch devices
  const effectiveHover = hover && !isTouchDevice;

  const clearAllTimeouts = () => {
    if (openTimeoutRef.current) {
      clearTimeout(openTimeoutRef.current);
      openTimeoutRef.current = null;
    }
    if (closeTimeoutRef.current) {
      clearTimeout(closeTimeoutRef.current);
      closeTimeoutRef.current = null;
    }
  };

  const handleMouseEnter = () => {
    // Cancel any pending close
    if (closeTimeoutRef.current) {
      clearTimeout(closeTimeoutRef.current);
      closeTimeoutRef.current = null;
    }

    if (effectiveHover) {
      // If already open, just keep it open (don't restart open delay)
      if (isOpen) {
        return;
      }

      // Cancel any pending open and start fresh
      if (openTimeoutRef.current) {
        clearTimeout(openTimeoutRef.current);
        openTimeoutRef.current = null;
      }

      if (hoverDelay > 0) {
        openTimeoutRef.current = setTimeout(() => {
          handleOpenChange?.(true);
        }, hoverDelay);
      } else {
        handleOpenChange?.(true);
      }
    }
  };

  const handleMouseLeave = () => {
    // Cancel any pending open
    if (openTimeoutRef.current) {
      clearTimeout(openTimeoutRef.current);
      openTimeoutRef.current = null;
    }

    if (effectiveHover) {
      // Add a small delay before closing to allow mouse to move to content
      if (hoverCloseDelay > 0) {
        closeTimeoutRef.current = setTimeout(() => {
          handleOpenChange?.(false);
        }, hoverCloseDelay);
      } else {
        handleOpenChange?.(false);
      }
    }
  };

  useEffect(() => {
    return () => {
      clearAllTimeouts();
    };
  }, []);

  return (
    <PopoverContext.Provider
      value={{
        hover: effectiveHover,
        onMouseEnter: effectiveHover ? handleMouseEnter : undefined,
        onMouseLeave: effectiveHover ? handleMouseLeave : undefined,
      }}
    >
      <PopoverPrimitive.Root
        data-slot="popover"
        data-testid="popover"
        open={isOpen}
        onOpenChange={handleOpenChange}
        {...props}
      >
        {children}
      </PopoverPrimitive.Root>
    </PopoverContext.Provider>
  );
}

function PopoverTrigger({
  asChild,
  onMouseEnter: propOnMouseEnter,
  onMouseLeave: propOnMouseLeave,
  ...props
}: React.ComponentProps<typeof PopoverPrimitive.Trigger>) {
  const { onMouseEnter: contextOnMouseEnter, onMouseLeave: contextOnMouseLeave, hover } = useContext(PopoverContext);

  const handleMouseEnter = (e: React.MouseEvent<HTMLButtonElement>) => {
    contextOnMouseEnter?.();
    propOnMouseEnter?.(e);
  };

  const handleMouseLeave = (e: React.MouseEvent<HTMLButtonElement>) => {
    contextOnMouseLeave?.();
    propOnMouseLeave?.(e);
  };

  const handleFocus = (e: React.FocusEvent<HTMLButtonElement>) => {
    // Prevent focus outline when using hover mode
    if (hover) {
      e.currentTarget.blur();
    }
    props.onFocus?.(e);
  };

  return (
    <PopoverPrimitive.Trigger
      data-slot="popover-trigger"
      data-testid="popover-trigger"
      data-as-child={asChild ? 'true' : 'false'}
      asChild={asChild}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onFocus={handleFocus}
      {...props}
    />
  );
}

function PopoverContent({
  className,
  align = 'center',
  sideOffset = 0,
  onMouseEnter: propOnMouseEnter,
  onMouseLeave: propOnMouseLeave,
  onOpenAutoFocus: propOnOpenAutoFocus,
  onCloseAutoFocus: propOnCloseAutoFocus,
  ...props
}: React.ComponentProps<typeof PopoverPrimitive.Content>) {
  const { hover, onMouseEnter: contextOnMouseEnter, onMouseLeave: contextOnMouseLeave } = useContext(PopoverContext);

  const handleMouseEnter = (e: React.MouseEvent<HTMLDivElement>) => {
    contextOnMouseEnter?.();
    propOnMouseEnter?.(e);
  };

  const handleMouseLeave = (e: React.MouseEvent<HTMLDivElement>) => {
    contextOnMouseLeave?.();
    propOnMouseLeave?.(e);
  };

  // Hover popovers are mouse-driven: they must never take focus on open nor
  // move it on close, otherwise they steal focus from whatever the user is
  // typing in (e.g. a tag input) just by moving the cursor.
  const handleOpenAutoFocus = (e: Event) => {
    propOnOpenAutoFocus?.(e);
    if (hover) e.preventDefault();
  };

  const handleCloseAutoFocus = (e: Event) => {
    propOnCloseAutoFocus?.(e);
    if (hover) e.preventDefault();
  };

  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content
        data-slot="popover-content"
        data-testid="popover-content"
        align={align}
        sideOffset={sideOffset}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onOpenAutoFocus={handleOpenAutoFocus}
        onCloseAutoFocus={handleCloseAutoFocus}
        className={cn(
          'z-50 mx-8 w-72 origin-(--radix-popover-content-transform-origin) rounded-md border bg-popover p-4 text-popover-foreground shadow-[0px_4px_6px_0px_rgba(5,5,10,0.25)] shadow-[0px_10px_15px_0px_rgba(5,5,10,0.50)] outline-hidden data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 sm:mx-0',
          className,
        )}
        {...props}
      />
    </PopoverPrimitive.Portal>
  );
}

function PopoverAnchor({ ...props }: React.ComponentProps<typeof PopoverPrimitive.Anchor>) {
  return <PopoverPrimitive.Anchor data-slot="popover-anchor" {...props} />;
}

export { Popover, PopoverAnchor, PopoverContent, PopoverTrigger };
