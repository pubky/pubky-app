import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useStableValue } from './useStableValue';

const tagList = () => [{ label: 'travel', taggers: [{ id: 'a' }, { id: 'b' }], taggers_count: 2 }];

describe('useStableValue', () => {
  it('keeps the first value while every render brings an equal one', () => {
    const first = tagList();
    const { result, rerender } = renderHook(({ value }) => useStableValue(value), { initialProps: { value: first } });

    rerender({ value: tagList() });
    rerender({ value: tagList() });

    expect(result.current).toBe(first);
  });

  it('takes a changed value at once, then keeps that one', () => {
    const { result, rerender } = renderHook(({ value }) => useStableValue(value), {
      initialProps: { value: tagList() },
    });
    const changed = [...tagList(), { label: 'city', taggers: [{ id: 'c' }], taggers_count: 1 }];

    rerender({ value: changed });
    expect(result.current).toBe(changed);

    rerender({ value: [...tagList(), { label: 'city', taggers: [{ id: 'c' }], taggers_count: 1 }] });
    expect(result.current).toBe(changed);
  });

  it('tells a changed nested value apart', () => {
    const { result, rerender } = renderHook(({ value }) => useStableValue(value), {
      initialProps: { value: tagList() },
    });
    const moreTaggers = [{ label: 'travel', taggers: [{ id: 'a' }, { id: 'b' }, { id: 'c' }], taggers_count: 3 }];

    rerender({ value: moreTaggers });

    expect(result.current).toBe(moreTaggers);
  });

  it('keeps a primitive, NaN too, without rendering again', () => {
    let renders = 0;
    const { result, rerender } = renderHook(
      ({ value }) => {
        renders += 1;
        return useStableValue(value);
      },
      { initialProps: { value: Number.NaN } },
    );

    rerender({ value: Number.NaN });

    expect(result.current).toBeNaN();
    expect(renders).toBe(2);
  });
});
