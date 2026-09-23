'use client';

import { useState } from 'react';
import { Check, Grid2X2, Grip, LayoutDashboard, type LucideIcon, Rows4 } from 'lucide-react';
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
import { useIsMobile } from '@/hooks/useIsMobile/useIsMobile';

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
  { value: 'masonry', label: 'Cards', icon: LayoutDashboard },
  { value: COLLECTION_LAYOUT.LIST, label: 'List', icon: Rows4 },
  { value: COLLECTION_LAYOUT.VISUAL, label: 'Visual', icon: Grid2X2 },
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
  const isPhoneViewport = useIsMobile({ breakpoint: 'md' });
  // Visual falls back to Grid on phones; retain the viewer's preference for larger screens.
  const displayedLayout = isPhoneViewport && layout === COLLECTION_LAYOUT.VISUAL ? COLLECTION_LAYOUT.GRID : layout;
  const availableLayouts = COLLECTION_LAYOUT_PICKER_OPTIONS.map((option) => option.value).filter(
    (value) => (!layouts || layouts.includes(value)) && (!isPhoneViewport || value !== COLLECTION_LAYOUT.VISUAL),
  );
  const activeOption = getPickerOption(displayedLayout);
  const layoutLabel = activeOption.label;
  const ActiveIcon = activeOption.icon;

  const handleSelect = (nextLayout: CollectionViewLayout) => {
    if (nextLayout !== layout) onLayoutChange(nextLayout);
    setOpen(false);
  };

  const trigger = (
    <Button variant="secondary" size="icon" aria-label={`Layout: ${layoutLabel}`} data-cy="collection-layout-menu">
      <ActiveIcon className="size-4" />
    </Button>
  );

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-70">
        <CollectionLayoutPickerContent layout={displayedLayout} onSelect={handleSelect} layouts={availableLayouts} />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
