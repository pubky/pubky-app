'use client';

import * as React from 'react';
import { FilterHeader, FilterRoot } from '@/atoms/Filter/Filter';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/atoms/Select/Select';
import { useControlledState } from '@/hooks/useControlledState/useControlledState';
import type { FilterListItem } from '../Filters.types';

interface FilterDropdownProps<T extends string> {
  title?: string;
  ariaLabel?: string;
  items: FilterListItem<T>[];
  selectedValue?: T;
  defaultValue?: T;
  onChange?: (value: T) => void;
  dataCy?: string;
  testId?: string;
}

export function FilterDropdown<T extends string>({
  title,
  ariaLabel,
  items,
  selectedValue: controlledValue,
  defaultValue,
  onChange,
  dataCy,
  testId,
}: FilterDropdownProps<T>) {
  const headerId = React.useId();
  const { value: selectedValue, setValue: setSelectedValue } = useControlledState({
    value: controlledValue,
    defaultValue: defaultValue ?? items[0]?.key,
    onChange,
  });
  const selectedItem = items.find((item) => item.key === selectedValue) ?? items[0];
  const isDisabled = items.every((item) => item.disabled);

  if (!selectedItem) {
    return null;
  }

  const SelectedIcon = selectedItem.icon;

  return (
    <FilterRoot>
      {title && <FilterHeader title={title} id={headerId} />}

      <Select value={selectedValue} onValueChange={(value) => setSelectedValue(value as T)} disabled={isDisabled}>
        <SelectTrigger
          aria-label={title ? undefined : ariaLabel}
          aria-labelledby={title ? headerId : undefined}
          data-cy={dataCy}
          data-testid={testId}
          className="h-8 gap-1 border-transparent py-0 transition-opacity hover:opacity-80 focus-visible:border-transparent focus-visible:ring-0 [&>svg:last-child]:size-6 [&>svg:last-child]:transition-transform [&>svg:last-child]:duration-300 data-[state=open]:[&>svg:last-child]:rotate-180"
        >
          <SelectValue>
            <span className="flex items-center gap-2">
              <span className="flex size-5 shrink-0 items-center justify-center [&>svg]:size-full">
                <SelectedIcon className="size-5" />
              </span>
              <span>{selectedItem.label}</span>
            </span>
          </SelectValue>
        </SelectTrigger>

        <SelectContent position="item-aligned" className="min-w-48">
          {items.map(({ key, label, icon: Icon, disabled, dataCy: itemDataCy }) => (
            <SelectItem
              key={key}
              value={key}
              disabled={disabled}
              aria-label={label}
              data-cy={itemDataCy}
              className="py-2 font-medium transition-colors hover:text-secondary-foreground hover:**:text-secondary-foreground data-[highlighted]:text-secondary-foreground data-[highlighted]:**:text-secondary-foreground data-[state=checked]:font-bold"
            >
              <span className="flex items-center gap-2">
                <span className="flex size-5 shrink-0 items-center justify-center [&>svg]:size-full">
                  <Icon className="size-5" />
                </span>
                <span>{label}</span>
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </FilterRoot>
  );
}
