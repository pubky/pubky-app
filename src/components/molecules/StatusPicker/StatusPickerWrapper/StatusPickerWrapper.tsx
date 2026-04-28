'use client';

import { useIsMobile } from '@/hooks/useIsMobile/useIsMobile';
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import * as Atoms from '@/atoms';
import * as Molecules from '@/molecules';
import * as Types from './index';
import { ChevronDown } from 'lucide-react';
import { parseStatus } from '@/libs/status/status';
import { cn } from '@/libs/utils/utils';

export function StatusPickerWrapper({
  emoji,
  status,
  onStatusChange,
  sideOffset = Types.DEFAULT_POPOVER_SIDE_OFFSET,
}: Types.StatusPickerWrapperProps) {
  const t = useTranslations('status');
  const [open, setOpen] = useState(false);
  const [localStatus, setLocalStatus] = useState<string | null>(null);
  const isMobile = useIsMobile();

  // Use local status if set, otherwise use prop
  const currentStatus = localStatus ?? status;
  const parsed = parseStatus(currentStatus, emoji);
  // Get translated text for predefined statuses
  const displayText = parsed.key ? t(parsed.key as Parameters<typeof t>[0]) : parsed.text;
  const handleStatusSelect = (selectedStatus: string) => {
    setLocalStatus(selectedStatus);
    onStatusChange?.(selectedStatus);
    setOpen(false);
  };
  const triggerButton = (
    <Atoms.Button
      variant="ghost"
      overrideDefaults={true}
      className="flex h-8 cursor-pointer items-center gap-1 p-0 focus-visible:border-none focus-visible:ring-0 focus-visible:outline-none"
    >
      {parsed.emoji && <span className="text-base leading-6">{parsed.emoji}</span>}
      <span className="text-base leading-6 font-bold text-white">{displayText}</span>
      <ChevronDown className={cn('size-6 transition-transform duration-300', open && 'rotate-180')} />
    </Atoms.Button>
  );
  if (isMobile) {
    return (
      <Atoms.Sheet open={open} onOpenChange={setOpen}>
        <Atoms.SheetTrigger asChild>{triggerButton}</Atoms.SheetTrigger>
        <Atoms.SheetContent side="bottom" onOpenAutoFocus={(e) => e.preventDefault()}>
          <Atoms.SheetHeader>
            <Atoms.SheetTitle>{t('selectStatus')}</Atoms.SheetTitle>
            <Atoms.SheetDescription className="sr-only">{t('selectStatusDescription')}</Atoms.SheetDescription>
          </Atoms.SheetHeader>
          <Atoms.Container overrideDefaults className="mt-4">
            <Molecules.StatusPickerContent onStatusSelect={handleStatusSelect} currentStatus={currentStatus} />
          </Atoms.Container>
        </Atoms.SheetContent>
      </Atoms.Sheet>
    );
  }
  return (
    <Atoms.Popover open={open} onOpenChange={setOpen}>
      <Atoms.PopoverTrigger asChild>{triggerButton}</Atoms.PopoverTrigger>
      <Atoms.PopoverContent
        className="w-(--popover-width)"
        sideOffset={sideOffset}
        side="top"
        align="start"
        onCloseAutoFocus={(e) => e.preventDefault()}
      >
        <Molecules.StatusPickerContent onStatusSelect={handleStatusSelect} currentStatus={currentStatus} />
      </Atoms.PopoverContent>
    </Atoms.Popover>
  );
}
