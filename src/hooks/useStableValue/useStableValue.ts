'use client';

import { useState } from 'react';
import { isEqual } from 'lodash-es';

/**
 * The value an earlier render gave while each new one is deep-equal to it (lodash `isEqual`), so a list built
 * afresh on every render keeps its identity for the hooks that depend on it (a memo, an effect or a Dexie live
 * query keyed on it). A changed value is taken at once.
 *
 * For plain data only (no functions or class instances): functions compare by identity, so a value holding a
 * new closure on every render never settles.
 *
 * @example
 * ```tsx
 * const list = useStableValue(tags.map((tag) => ({ ...tag, taggers: tag.taggers.map((id) => ({ id })) })));
 * ```
 */
export function useStableValue<T>(value: T): T {
  // Boxed, so the value is stored as it is (useState would call a function as its initializer or updater).
  const [kept, setKept] = useState(() => ({ value }));
  if (kept.value !== value && !isEqual(kept.value, value)) {
    // Kept from the previous render (react.dev, "Storing information from previous renders"): React
    // renders again at once with the new value kept, before anything is committed.
    setKept({ value });
    return value;
  }
  return kept.value;
}
