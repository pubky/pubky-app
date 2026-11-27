// A homeserver's epoch names the log a device read from it, so two devices holding the same epoch read the same log.
// A device names it when it first reads the homeserver (`contactEpoch`), and names it anew when the log went back, a
// restore (`restoreEpoch`); a saved index carries it, and a device that loads one takes the newest name it meets.
// One log can get two names, as when two devices find the same restore. Newest is an order every device computes
// alike, so they settle on one name: any restore's after any first contact, a later restore's after an earlier one,
// and an earlier first contact's after a later one, since the device that read the homeserver first holds the most.
// `''` is a homeserver never read. A decimal string is an epoch an earlier release counted, ordered by its count
// before any name, as that release compared them.

export type Epoch = string;

/** The epoch of a homeserver never read. */
export const NO_EPOCH: Epoch = '';

const NAMED = /^([cr])(\d{1,16})\.([0-9a-z]{1,16})$/;
const COUNTED = /^\d{1,9}$/;

export const isEpoch = (value: string): boolean => value === NO_EPOCH || COUNTED.test(value) || NAMED.test(value);

/** An epoch counted by an earlier release, as a name. */
export const countedEpoch = (count: number): Epoch => String(count);

const randomPart = () => Math.random().toString(36).slice(2, 10).padEnd(8, '0');

const msOf = (nowMs: number) => Math.max(0, Math.floor(nowMs));

/** The name a device gives the log of a homeserver it reads for the first time. */
export const contactEpoch = (nowMs: number): Epoch => `c${msOf(nowMs)}.${randomPart()}`;

/** The name of the log after a restore of the log named `previous`: newer than it, whatever the clock says. */
export function restoreEpoch(previous: Epoch, nowMs: number): Epoch {
  const prior = NAMED.exec(previous);
  const after = prior !== null && prior[1] === 'r' ? Number(prior[2]) + 1 : 0;
  return `r${Math.max(after, msOf(nowMs))}.${randomPart()}`;
}

function rankOf(epoch: Epoch): [number, number, string] {
  if (epoch === NO_EPOCH) return [0, 0, ''];
  const named = NAMED.exec(epoch);
  if (named === null) return [1, Number(epoch) || 0, epoch];
  const ms = Number(named[2]);
  return named[1] === 'r' ? [3, ms, named[3]] : [2, -ms, named[3]];
}

/** Negative when `a` is older than `b`, 0 when they are the same name. */
export function compareEpochs(a: Epoch, b: Epoch): number {
  const [classA, orderA, tieA] = rankOf(a);
  const [classB, orderB, tieB] = rankOf(b);
  if (classA !== classB) return classA - classB;
  if (orderA !== orderB) return orderA - orderB;
  return tieA < tieB ? -1 : tieA > tieB ? 1 : 0;
}

/** The newest of the epochs, `NO_EPOCH` for none. */
export const newestEpoch = (epochs: Iterable<Epoch>): Epoch =>
  [...epochs].reduce((newest, epoch) => (compareEpochs(epoch, newest) > 0 ? epoch : newest), NO_EPOCH);
