'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { FilterHeader, FilterRoot } from '@/atoms/Filter/Filter';
import { Typography } from '@/atoms/Typography/Typography';
import { useControlledState } from '@/hooks/useControlledState/useControlledState';
import { useRadiogroupKeyboard } from '@/hooks/useRadiogroupKeyboard/useRadiogroupKeyboard';
import { cn } from '@/libs/utils/utils';
import { REACH, type ReachType } from '@/stores/home/home.types';
import type { BaseFilterProps } from '../Filters.types';

interface ReachItem {
  key: ReachType;
  label: string;
  sizeClassName: string;
  layerClassName: string;
  disabled?: boolean;
}

const REACH_RINGS: ReadonlyArray<{ radius: number; value: ReachType }> = [
  { radius: 89.5, value: REACH.ALL },
  { radius: 75.5, value: REACH.NETWORK },
  { radius: 61.5, value: REACH.FOLLOWING },
  { radius: 47.5, value: REACH.FRIENDS },
  { radius: 33.5, value: REACH.ME },
];

export function FilterReach({
  selectedTab,
  defaultSelectedTab = REACH.ALL,
  onTabChange,
  disabled,
}: BaseFilterProps<ReachType>) {
  const t = useTranslations('filters.reach');
  const headerId = React.useId();
  const [hoveredValue, setHoveredValue] = React.useState<ReachType>();
  const items: ReachItem[] = [
    {
      key: REACH.ME,
      label: t('me'),
      sizeClassName: 'size-[68px]',
      layerClassName: 'z-60',
      disabled,
    },
    {
      key: REACH.FRIENDS,
      label: t('friends'),
      sizeClassName: 'size-[96px]',
      layerClassName: 'z-50',
      disabled,
    },
    {
      key: REACH.FOLLOWING,
      label: t('following'),
      sizeClassName: 'size-[124px]',
      layerClassName: 'z-40',
      disabled,
    },
    {
      key: REACH.NETWORK,
      label: t('myNetwork'),
      sizeClassName: 'size-[152px]',
      layerClassName: 'z-30',
      disabled,
    },
    {
      key: REACH.ALL,
      label: t('all'),
      sizeClassName: 'size-[180px]',
      layerClassName: 'z-10',
      disabled,
    },
  ];

  const { value: selectedValue, setValue: setSelectedValue } = useControlledState({
    value: selectedTab,
    defaultValue: defaultSelectedTab,
    onChange: onTabChange,
  });

  const isPreviewingAnotherValue = hoveredValue !== undefined && hoveredValue !== selectedValue;

  const selectItem = (item: ReachItem) => {
    if (item.disabled) return;
    setSelectedValue(item.key);
  };

  const { listRef, handleKeyDown } = useRadiogroupKeyboard({
    items,
    onSelect: selectItem,
    isDisabled: (item) => item.disabled ?? false,
  });

  const visibleValue = hoveredValue ?? selectedValue;
  const visibleLabel = items.find((item) => item.key === visibleValue)?.label;

  return (
    <FilterRoot className="gap-4">
      <FilterHeader title={t('title')} id={headerId} />

      <div
        ref={listRef}
        role="radiogroup"
        aria-labelledby={headerId}
        className={cn('relative size-[180px] shrink-0', disabled && 'opacity-40')}
        data-cy="filter-reach-radiogroup"
        data-testid="filter-reach-radiogroup"
      >
        <svg aria-hidden="true" className="pointer-events-none absolute inset-0 size-full" viewBox="0 0 180 180">
          {REACH_RINGS.map((ring) => {
            const isHovered = ring.value === hoveredValue;
            const isSelected = ring.value === selectedValue;
            const isSelectedPreview = isPreviewingAnotherValue && isSelected;
            const fillClassName = isSelected
              ? isSelectedPreview
                ? 'fill-transparent'
                : 'fill-brand/[0.10]'
              : 'fill-transparent';
            const strokeClassName = isSelected
              ? isSelectedPreview
                ? 'stroke-brand/[0.32]'
                : 'stroke-brand'
              : isHovered
                ? 'stroke-foreground'
                : 'stroke-border';

            return (
              <circle
                key={ring.radius}
                cx="90"
                cy="90"
                r={ring.radius}
                className={cn('transition-colors', fillClassName, strokeClassName)}
                data-reach-ring={ring.value}
              />
            );
          })}
        </svg>

        {items.map((item, index) => {
          const isSelected = selectedValue === item.key;

          return (
            <button
              key={item.key}
              type="button"
              role="radio"
              aria-checked={isSelected}
              aria-label={item.label}
              aria-disabled={item.disabled}
              aria-pressed={isSelected}
              disabled={item.disabled}
              tabIndex={isSelected && !item.disabled ? 0 : -1}
              className={cn(
                'absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 cursor-pointer rounded-full bg-transparent p-0 outline-none',
                'focus-visible:outline-1 focus-visible:-outline-offset-1 focus-visible:outline-foreground',
                item.sizeClassName,
                item.layerClassName,
                item.disabled && 'cursor-default',
              )}
              data-reach-option={item.key}
              data-selected={isSelected ? 'true' : 'false'}
              data-slot="filter-item"
              data-testid="filter-item"
              onClick={() => selectItem(item)}
              onKeyDown={(event) => handleKeyDown(event, index)}
              onMouseEnter={() => {
                if (!item.disabled) {
                  setHoveredValue(item.key);
                }
              }}
              onMouseLeave={() => setHoveredValue(undefined)}
            />
          );
        })}

        <Typography
          as="span"
          size="xs"
          className={cn(
            'pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 leading-4 tracking-[1.2px] uppercase drop-shadow-[0_1px_2px_rgba(0,0,0,0.75)] transition-colors select-none',
            isPreviewingAnotherValue ? 'text-foreground' : 'text-brand',
          )}
          data-testid="filter-reach-label"
        >
          {visibleLabel}
        </Typography>
      </div>
    </FilterRoot>
  );
}
