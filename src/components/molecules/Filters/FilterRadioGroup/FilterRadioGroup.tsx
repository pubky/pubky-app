'use client';

import * as React from 'react';
import * as Atoms from '@/atoms';
import * as Hooks from '@/hooks';
import * as Molecules from '@/molecules';

export interface FilterRadioGroupProps<T = string> {
  title: string;
  items: Molecules.FilterListItem<T>[];
  selectedValue?: T;
  defaultValue?: T;
  onChange?: (value: T) => void;
  onClose?: () => void;
  dataCy?: string;
  testId?: string;
}

export function FilterRadioGroup<T extends string = string>({
  title,
  items,
  selectedValue: controlledValue,
  defaultValue,
  onChange,
  onClose,
  dataCy,
  testId,
}: FilterRadioGroupProps<T>) {
  const headerId = React.useId();

  const { value: selectedValue, setValue: setSelectedValue } = Hooks.useControlledState({
    value: controlledValue,
    defaultValue: defaultValue ?? items[0]?.key,
    onChange,
  });

  const { listRef, handleKeyDown: handleRadiogroupKeyDown } = Hooks.useRadiogroupKeyboard({
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
    <Atoms.FilterRoot>
      <Atoms.FilterHeader title={title} id={headerId} />

      <Atoms.Container
        overrideDefaults
        ref={listRef}
        role="radiogroup"
        aria-labelledby={headerId}
        data-cy={dataCy}
        data-testid={testId || `filter-${title.toLowerCase()}-radiogroup`}
      >
        <Atoms.FilterList>
          {items.map(({ key, label, icon: Icon, disabled, dataCy: itemDataCy }, index) => {
            const isSelected = selectedValue === key;

            return (
              <Atoms.FilterItem
                key={String(key)}
                isSelected={isSelected}
                onClick={() => handleItemClick(key, disabled)}
                onKeyDown={(e) => handleRadiogroupKeyDown(e, index)}
                role="radio"
                aria-checked={isSelected}
                aria-label={label}
                aria-disabled={disabled}
                tabIndex={isSelected ? 0 : -1}
                data-cy={itemDataCy}
                className={disabled ? 'cursor-default opacity-40' : undefined}
              >
                <Atoms.FilterItemIcon icon={Icon} />
                <Atoms.FilterItemLabel>{label}</Atoms.FilterItemLabel>
              </Atoms.FilterItem>
            );
          })}
        </Atoms.FilterList>
      </Atoms.Container>
    </Atoms.FilterRoot>
  );
}
