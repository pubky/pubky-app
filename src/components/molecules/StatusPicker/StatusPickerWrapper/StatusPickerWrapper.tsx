'use client';

import { useIsMobile } from '@/hooks/useIsMobile/useIsMobile';
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/atoms/Button/Button';
import { Container } from '@/atoms/Container/Container';
import { Popover, PopoverContent, PopoverTrigger } from '@/atoms/Popover/Popover';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from '@/atoms/Sheet/Sheet';
import { StatusPickerContent } from '../StatusPickerContent/StatusPickerContent';
import { DEFAULT_POPOVER_SIDE_OFFSET } from './StatusPickerWrapper.constants';
import { StatusPickerWrapperProps } from './StatusPickerWrapper.types';

import { ChevronDown } from 'lucide-react';
import { parseStatus } from '@/libs/status/status';
import { cn } from '@/libs/utils/utils';

export function StatusPickerWrapper({
  emoji,
  status,
  onStatusChange,
  sideOffset = DEFAULT_POPOVER_SIDE_OFFSET,
}: StatusPickerWrapperProps) {
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
    <Button
      variant="ghost"
      overrideDefaults={true}
      className="flex h-8 cursor-pointer items-center gap-1 p-0 focus-visible:border-none focus-visible:ring-0 focus-visible:outline-none"
    >
      {parsed.emoji && <span className="text-base leading-6">{parsed.emoji}</span>}
      <span className="text-base leading-6 font-bold text-white">{displayText}</span>
      <ChevronDown className={cn('size-6 transition-transform duration-300', open && 'rotate-180')} />
    </Button>
  );
  if (isMobile) {
    return (
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>{triggerButton}</SheetTrigger>
        <SheetContent side="bottom" onOpenAutoFocus={(e) => e.preventDefault()}>
          <SheetHeader>
            <SheetTitle>{t('selectStatus')}</SheetTitle>
            <SheetDescription className="sr-only">{t('selectStatusDescription')}</SheetDescription>
          </SheetHeader>
          <Container overrideDefaults className="mt-4">
            <StatusPickerContent onStatusSelect={handleStatusSelect} currentStatus={currentStatus} />
          </Container>
        </SheetContent>
      </Sheet>
    );
  }
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{triggerButton}</PopoverTrigger>
      <PopoverContent
        className="w-(--popover-width)"
        sideOffset={sideOffset}
        side="top"
        align="start"
        onCloseAutoFocus={(e) => e.preventDefault()}
      >
        <StatusPickerContent onStatusSelect={handleStatusSelect} currentStatus={currentStatus} />
      </PopoverContent>
    </Popover>
  );
}
