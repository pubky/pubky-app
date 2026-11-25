import { InvalidIndexInputError } from './indexer.errors';
import type { Run } from './indexer.types';
import { assertValidRun } from './run';
import type { HomeserverState, ScopeKey, StoreBatch } from './store.types';

// Rules every `IndexStore` applies the same way, so the stores differ only in where they keep the data.

export const scopeId = ({ author, homeserver, group }: ScopeKey) => JSON.stringify([author, homeserver, group]);

function assertRunsOf<D>(scope: ScopeKey, runs: readonly Run<D>[]): void {
  for (const run of runs) {
    assertValidRun(run);
    if (run.author !== scope.author || run.homeserver !== scope.homeserver || run.group !== scope.group) {
      throw new InvalidIndexInputError(`run of ${scopeId(run)} cannot be stored under ${scopeId(scope)}`);
    }
  }
}

/** Throws unless every run of the batch is valid and belongs to the scope it is stored under. */
export function assertValidBatch<D>(batch: StoreBatch<D>): void {
  for (const { scope, runs } of batch.replaceRuns ?? []) assertRunsOf(scope, runs);
  for (const run of batch.appendRuns ?? []) assertRunsOf(run, [run]);
}

/** `current` with the fields `patch` sets; a field left out keeps its value. */
export function patchedState(current: Readonly<HomeserverState>, patch: Partial<HomeserverState>): HomeserverState {
  return {
    highWater: patch.highWater !== undefined ? patch.highWater : current.highWater,
    windowStart: patch.windowStart !== undefined ? patch.windowStart : current.windowStart,
    failure: patch.failure !== undefined ? patch.failure : current.failure,
  };
}
