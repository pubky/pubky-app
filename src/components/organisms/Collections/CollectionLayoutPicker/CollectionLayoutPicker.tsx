'use client';

import { useState } from 'react';
import { Check, ChevronDown, Grip, LayoutGrid, type LucideIcon, Rows4 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '@/atoms/Button/Button';
import { Container } from '@/atoms/Container/Container';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/atoms/DropdownMenu/DropdownMenu';
import { Typography } from '@/atoms/Typography/Typography';
import { COLLECTION_LAYOUT, type CollectionLayout } from '@/config/collections';

interface CollectionLayoutPickerProps {
  layout: CollectionLayout;
  onLayoutChange: (layout: CollectionLayout) => void;
}

interface CollectionLayoutOptionProps {
  value: CollectionLayout;
  label: string;
  icon: LucideIcon;
  isSelected: boolean;
  dataCy: string;
  onSelect: (layout: CollectionLayout) => void;
}

interface CollectionLayoutPickerContentProps {
  layout: CollectionLayout;
  onSelect: (layout: CollectionLayout) => void;
}

const COLLECTION_LAYOUT_PICKER_OPTIONS: Array<{
  value: CollectionLayout;
  labelKey: 'layoutGrid' | 'layoutList' | 'layoutVisual';
  icon: LucideIcon;
}> = [
  { value: COLLECTION_LAYOUT.GRID, labelKey: 'layoutGrid', icon: Grip },
  { value: COLLECTION_LAYOUT.LIST, labelKey: 'layoutList', icon: Rows4 },
  { value: COLLECTION_LAYOUT.VISUAL, labelKey: 'layoutVisual', icon: LayoutGrid },
];

function getPickerOption(layout: CollectionLayout) {
  return (
    COLLECTION_LAYOUT_PICKER_OPTIONS.find((option) => option.value === layout) ?? COLLECTION_LAYOUT_PICKER_OPTIONS[0]
  );
}

function CollectionLayoutOption({
  value,
  label,
  icon: Icon,
  isSelected,
  dataCy,
  onSelect,
}: CollectionLayoutOptionProps) {
  const content = (
    <>
      <Icon className="size-4" />
      <Typography as="span" overrideDefaults className="min-w-0 flex-1 truncate">
        {label}
      </Typography>
      {isSelected && <Check aria-hidden="true" className="size-4 text-brand" />}
    </>
  );

  return (
    <DropdownMenuItem
      onSelect={() => onSelect(value)}
      className="w-full gap-2 p-0 text-base font-medium text-muted-foreground"
      data-cy={dataCy}
    >
      {content}
    </DropdownMenuItem>
  );
}

function CollectionLayoutPickerContent({ layout, onSelect }: CollectionLayoutPickerContentProps) {
  const t = useTranslations('collections.single');

  return (
    <Container overrideDefaults className="flex w-full flex-col gap-3">
      {COLLECTION_LAYOUT_PICKER_OPTIONS.map((option) => (
        <CollectionLayoutOption
          key={option.value}
          value={option.value}
          label={t(option.labelKey)}
          icon={option.icon}
          isSelected={layout === option.value}
          dataCy={`collection-layout-${option.value}`}
          onSelect={onSelect}
        />
      ))}
    </Container>
  );
}

export function CollectionLayoutPicker({ layout, onLayoutChange }: CollectionLayoutPickerProps) {
  const t = useTranslations('collections.single');
  const [open, setOpen] = useState(false);
  const activeOption = getPickerOption(layout);
  const layoutLabel = t(activeOption.labelKey);
  const ActiveIcon = activeOption.icon;

  const handleSelect = (nextLayout: CollectionLayout) => {
    if (nextLayout !== layout) onLayoutChange(nextLayout);
    setOpen(false);
  };

  const trigger = (
    <Button
      variant="secondary"
      size="icon"
      aria-label={`${t('layout')}: ${layoutLabel}`}
      data-cy="collection-layout-menu"
      className="hidden lg:inline-flex lg:h-8 lg:w-auto lg:gap-1.5 lg:px-3.5 lg:text-xs"
    >
      <ActiveIcon className="size-4" />
      <Typography as="span" overrideDefaults className="hidden lg:inline">
        {layoutLabel}
      </Typography>
      <ChevronDown className="hidden size-3.5 lg:block" />
    </Button>
  );

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-70">
        <CollectionLayoutPickerContent layout={layout} onSelect={handleSelect} />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
