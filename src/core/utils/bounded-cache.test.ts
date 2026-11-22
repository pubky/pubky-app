import { afterEach, describe, expect, it, vi } from 'vitest';
import { BOUNDED_READ_BUSY, BoundedReadCache } from './bounded-cache';

const cache = (overrides: Partial<ConstructorParameters<typeof BoundedReadCache<string>>[0]> = {}) =>
  new BoundedReadCache<string>({
    maxEntries: 3,
    maxBytes: 10,
    maxInFlight: 2,
    hitTtlMs: 1_000,
    missTtlMs: 100,
    sizeOf: (value) => value.length,
    ...overrides,
  });

afterEach(() => vi.useRealTimers());

describe('BoundedReadCache', () => {
  it('shares one read between concurrent requests and answers later ones from memory', async () => {
    const reads = cache();
    const load = vi.fn(async () => 'abc');
    await Promise.all([reads.read('a', load), reads.read('a', load)]);
    await expect(reads.read('a', load)).resolves.toBe('abc');
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('keeps a value for its time and a miss for its own', async () => {
    vi.useFakeTimers();
    const reads = cache();
    const value = vi.fn(async () => 'abc');
    const miss = vi.fn(async () => null);
    await reads.read('a', value);
    await reads.read('b', miss);
    vi.advanceTimersByTime(101);
    await reads.read('a', value);
    await reads.read('b', miss);
    expect(value).toHaveBeenCalledTimes(1);
    expect(miss).toHaveBeenCalledTimes(2);
    vi.advanceTimersByTime(1_000);
    await reads.read('a', value);
    expect(value).toHaveBeenCalledTimes(2);
  });

  it('remembers no failed read', async () => {
    const reads = cache();
    await expect(reads.read('a', () => Promise.reject(new Error('down')))).rejects.toThrow('down');
    await expect(reads.read('a', async () => 'abc')).resolves.toBe('abc');
  });

  it('drops the oldest used past its entries or its bytes', async () => {
    const reads = cache();
    const load = vi.fn(async (value: string) => value);
    for (const key of ['a', 'b', 'c']) await reads.read(key, () => load('x'));
    await reads.read('a', () => load('x'));
    await reads.read('d', () => load('x'));
    // `b` was the oldest used: read again; `a` was kept.
    await reads.read('a', () => load('x'));
    await reads.read('b', () => load('x'));
    expect(load).toHaveBeenCalledTimes(5);

    const small = cache();
    await small.read('big', async () => '123456');
    await small.read('bigger', async () => '1234567');
    const again = vi.fn(async () => '123456');
    await small.read('big', again);
    expect(again).toHaveBeenCalledTimes(1);
  });

  it('keeps a value for its own time when it says so, and leaves out what it should not keep', async () => {
    vi.useFakeTimers();
    const reads = cache({ ttlOf: (value) => (value === 'short' ? 10 : undefined), keeps: (value) => value !== 'busy' });
    const short = vi.fn(async () => 'short');
    const busy = vi.fn(async () => 'busy');
    await reads.read('a', short);
    await reads.read('b', busy);
    await reads.read('b', busy);
    expect(busy).toHaveBeenCalledTimes(2);
    vi.advanceTimersByTime(11);
    await reads.read('a', short);
    expect(short).toHaveBeenCalledTimes(2);
  });

  it('reads again a kept value older than the age asked for', async () => {
    vi.useFakeTimers();
    const reads = cache();
    const load = vi.fn(async () => 'abc');
    await reads.read('a', load);
    vi.advanceTimersByTime(50);
    await reads.read('a', load, { maxAgeMs: 100 });
    expect(load).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(51);
    await reads.read('a', load, { maxAgeMs: 100 });
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('never keeps a value larger than all its bytes, so it pushes no other entry out', async () => {
    const reads = cache({ maxBytes: 5 });
    await reads.read('small', async () => 'abc');
    const huge = vi.fn(async () => '123456');
    await expect(reads.read('huge', huge)).resolves.toBe('123456');
    await reads.read('huge', huge);
    expect(huge).toHaveBeenCalledTimes(2);
    const small = vi.fn(async () => 'abc');
    await reads.read('small', small);
    expect(small).not.toHaveBeenCalled();
  });

  it('keeps an expired value until a value to keep replaces it, and offers it as stale', async () => {
    vi.useFakeTimers();
    const reads = cache({ keeps: (value) => value !== 'busy' });
    await reads.read('a', async () => 'abc');
    vi.advanceTimersByTime(1_001);
    await expect(reads.read('a', async () => 'busy')).resolves.toBe('busy');
    expect(reads.stale('a')).toBe('abc');
    await expect(reads.read('a', () => Promise.reject(new Error('down')))).rejects.toThrow('down');
    expect(reads.stale('a')).toBe('abc');
    await reads.read('a', async () => 'new');
    expect(reads.stale('a')).toBe('new');
    expect(reads.stale('none')).toBeUndefined();
  });

  it('answers busy for a new key while too many are read', async () => {
    const reads = cache();
    const never = () => new Promise<string>(() => {});
    void reads.read('a', never);
    void reads.read('b', never);
    const load = vi.fn(async () => 'x');
    await expect(reads.read('c', load)).resolves.toBe(BOUNDED_READ_BUSY);
    expect(load).not.toHaveBeenCalled();
  });
});
