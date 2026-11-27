/** Items taken out first by `before`, each `push` and `pop` in time logarithmic in the size. */
export interface Heap<T> {
  push(item: T): void;
  /** The item no other comes before, `undefined` when empty. */
  pop(): T | undefined;
  readonly size: number;
}

/** A binary heap: `before(a, b)` says whether `a` comes out ahead of `b`. */
export function createHeap<T>(before: (a: T, b: T) => boolean): Heap<T> {
  const items: T[] = [];
  const swap = (i: number, j: number) => {
    const item = items[i];
    items[i] = items[j];
    items[j] = item;
  };
  return {
    push(item) {
      items.push(item);
      for (let i = items.length - 1; i > 0;) {
        const parent = (i - 1) >> 1;
        if (!before(items[i], items[parent])) break;
        swap(i, parent);
        i = parent;
      }
    },
    pop() {
      if (items.length === 0) return undefined;
      const top = items[0];
      const last = items.pop();
      if (items.length > 0 && last !== undefined) {
        items[0] = last;
        for (let i = 0; ;) {
          const left = 2 * i + 1;
          const right = left + 1;
          let first = i;
          if (left < items.length && before(items[left], items[first])) first = left;
          if (right < items.length && before(items[right], items[first])) first = right;
          if (first === i) break;
          swap(i, first);
          i = first;
        }
      }
      return top;
    },
    get size() {
      return items.length;
    },
  };
}
