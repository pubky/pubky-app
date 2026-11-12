'use client';

import * as React from 'react';
import { Container } from '@/atoms/Container/Container';
import {
  FilterHeader,
  FilterItem,
  FilterItemCheck,
  FilterItemIcon,
  FilterItemLabel,
  FilterList,
  FilterRoot,
} from '@/atoms/Filter/Filter';
import { useControlledState } from '@/hooks/useControlledState/useControlledState';
import { useRadiogroupKeyboard } from '@/hooks/useRadiogroupKeyboard/useRadiogroupKeyboard';
import { FilterListItem } from '../Filters.types';

export interface FilterRadioGroupProps<T = string> {
  title: string;
  /** A short line under the title, part of the group's name (why some options are disabled). */
  subtitle?: string;
  items: FilterListItem<T>[];
  itemExtras?: Partial<Record<T & string, React.ReactNode>>;
  selectedValue?: T;
  defaultValue?: T;
  onChange?: (value: T) => void;
  onClose?: () => void;
  dataCy?: string;
  testId?: string;
}

export function FilterRadioGroup<T extends string = string>({
  title,
  subtitle,
  items,
  itemExtras,
  selectedValue: controlledValue,
  defaultValue,
  onChange,
  onClose,
  dataCy,
  testId,
}: FilterRadioGroupProps<T>) {
  const headerId = React.useId();

  const { value: selectedValue, setValue: setSelectedValue } = useControlledState({
    value: controlledValue,
    defaultValue: defaultValue ?? items[0]?.key,
    onChange,
  });

  const { listRef, handleKeyDown: handleRadiogroupKeyDown } = useRadiogroupKeyboard({
    items,
    onSelect: (item) => {
      if (!item.disabled) {
        setSelectedValue(item.key);
        onClose?.();
      }
    },
    isDisabled: (item) => item.disabled ?? false,
  });

  const handleItemClick = React.useCallback(
    (key: T, disabled?: boolean) => {
      if (!disabled) {
        setSelectedValue(key);
        onClose?.();
      }
    },
    [setSelectedValue, onClose],
  );

  return (
    <FilterRoot>
      <FilterHeader title={title} subtitle={subtitle} id={headerId} />

      <Container
        overrideDefaults
        ref={listRef}
        role="radiogroup"
        aria-labelledby={headerId}
        data-cy={dataCy}
        data-testid={testId || `filter-${title.toLowerCase()}-radiogroup`}
      >
        <FilterList>
          {items.map(({ key, label, icon: Icon, disabled, dataCy: itemDataCy, count }, index) => {
            const isSelected = selectedValue === key;

            return (
              <React.Fragment key={String(key)}>
                <FilterItem
                  isSelected={isSelected}
                  onClick={() => handleItemClick(key, disabled)}
                  onKeyDown={(e) => handleRadiogroupKeyDown(e, index)}
                  role="radio"
                  aria-checked={isSelected}
                  aria-label={count === undefined ? label : `${label}, ${count}`}
                  aria-disabled={disabled}
                  tabIndex={isSelected ? 0 : -1}
                  data-cy={itemDataCy}
                  className={disabled ? 'cursor-default opacity-40' : undefined}
                >
                  <FilterItemIcon icon={Icon} />
                  <FilterItemLabel>{label}</FilterItemLabel>
                  {count !== undefined && (
                    <FilterItemLabel className="text-muted-foreground" aria-hidden>
                      {count}
                    </FilterItemLabel>
                  )}
                  {isSelected && <FilterItemCheck />}
                </FilterItem>
                {itemExtras?.[key]}
              </React.Fragment>
            );
          })}
        </FilterList>
      </Container>
    </FilterRoot>
  );
}
