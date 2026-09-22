'use client';

import { useState } from 'react';
import { Check, ChevronDown, Grip, LayoutGrid, type LucideIcon, PanelsTopLeft, Rows4 } from 'lucide-react';
import { Button } from '@/atoms/Button/Button';
import { Container } from '@/atoms/Container/Container';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/atoms/DropdownMenu/DropdownMenu';
import { Typography } from '@/atoms/Typography/Typography';
import { COLLECTION_LAYOUT, type CollectionViewLayout } from '@/config/collections';

interface CollectionLayoutPickerProps {
  layout: CollectionViewLayout;
  onLayoutChange: (layout: CollectionViewLayout) => void;
  layouts?: readonly CollectionViewLayout[];
}

interface CollectionLayoutOptionProps {
  value: CollectionViewLayout;
  label: string;
  icon: LucideIcon;
  isSelected: boolean;
  dataCy: string;
  onSelect: (layout: CollectionViewLayout) => void;
}

interface CollectionLayoutPickerContentProps {
  layouts?: readonly CollectionViewLayout[];
  layout: CollectionViewLayout;
  onSelect: (layout: CollectionViewLayout) => void;
}

const COLLECTION_LAYOUT_PICKER_OPTIONS: Array<{
  value: CollectionViewLayout;
  label: string;
  icon: LucideIcon;
}> = [
  { value: COLLECTION_LAYOUT.GRID, label: 'Grid', icon: Grip },
  { value: 'masonry', label: 'Masonry', icon: PanelsTopLeft },
  { value: COLLECTION_LAYOUT.LIST, label: 'List', icon: Rows4 },
  { value: COLLECTION_LAYOUT.VISUAL, label: 'Visual', icon: LayoutGrid },
];

function getPickerOption(layout: CollectionViewLayout) {
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

function CollectionLayoutPickerContent({ layout, onSelect, layouts }: CollectionLayoutPickerContentProps) {
  return (
    <Container overrideDefaults className="flex w-full flex-col gap-3">
      {COLLECTION_LAYOUT_PICKER_OPTIONS.filter((option) => !layouts || layouts.includes(option.value)).map((option) => (
        <CollectionLayoutOption
          key={option.value}
          value={option.value}
          label={option.label}
          icon={option.icon}
          isSelected={layout === option.value}
          dataCy={`collection-layout-${option.value}`}
          onSelect={onSelect}
        />
      ))}
    </Container>
  );
}

export function CollectionLayoutPicker({ layout, onLayoutChange, layouts }: CollectionLayoutPickerProps) {
  const [open, setOpen] = useState(false);
  const activeOption = getPickerOption(layout);
  const layoutLabel = activeOption.label;
  const ActiveIcon = activeOption.icon;

  const handleSelect = (nextLayout: CollectionViewLayout) => {
    if (nextLayout !== layout) onLayoutChange(nextLayout);
    setOpen(false);
  };

  const trigger = (
    <Button
      variant="secondary"
      size="icon"
      aria-label={`Layout: ${layoutLabel}`}
      data-cy="collection-layout-menu"
      className="h-8 w-auto gap-1.5 px-3.5 text-xs"
    >
      <ActiveIcon className="size-4" />
      <Typography as="span" overrideDefaults className="inline">
        {layoutLabel}
      </Typography>
      <ChevronDown className="size-3.5" />
    </Button>
  );

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-70">
        <CollectionLayoutPickerContent layout={layout} onSelect={handleSelect} layouts={layouts} />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
