// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { createHeap } from './heap';

describe('createHeap', () => {
  it('takes items out in order, whatever order they went in', () => {
    const heap = createHeap<number>((a, b) => a > b);
    const items = [5, 1, 9, 3, 9, 0, 7, 2];
    for (const item of items) heap.push(item);
    const out: number[] = [];
    for (let item = heap.pop(); item !== undefined; item = heap.pop()) out.push(item);
    expect(out).toEqual([...items].sort((a, b) => b - a));
    expect(heap.size).toBe(0);
  });

  it('keeps pushes made between pops in order', () => {
    const heap = createHeap<number>((a, b) => a > b);
    for (const item of [4, 8, 2]) heap.push(item);
    expect(heap.pop()).toBe(8);
    heap.push(6);
    heap.push(1);
    expect([heap.pop(), heap.pop(), heap.pop(), heap.pop(), heap.pop()]).toEqual([6, 4, 2, 1, undefined]);
  });

  it('compares a logarithmic number of times per item for thousands of them', () => {
    let comparisons = 0;
    const heap = createHeap<number>((a, b) => {
      comparisons += 1;
      return a > b;
    });
    const n = 5000;
    for (let i = 0; i < n; i += 1) heap.push((i * 7919) % n);
    for (let i = 0; i < n; i += 1) heap.pop();
    // Two comparisons per level on the way down, one on the way up: far below the n * n a sorted copy per push costs.
    expect(comparisons).toBeLessThan(3 * n * Math.log2(n));
  });
});
