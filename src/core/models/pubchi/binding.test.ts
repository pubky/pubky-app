import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { deletePubchiDatabase, getPubchiDatabase, resetPubchiDatabaseForTests } from '@/database/pubchi/pubchi';
import { AuthErrorCode } from '@/libs/error/error.codes';
import { Err } from '@/libs/error/error.factories';
import { ErrorService } from '@/libs/error/error.types';
import { resetRuntimeConfigForTests } from '@/libs/runtime-config/runtime-config';
import { PUBKY_RUNTIME_ENV_NAMES } from '@/libs/runtime-config/runtime-config.schema';
import { PubchiBindingModel } from '@/models/pubchi/binding';
import type { PubchiBindingRecord } from '@/models/pubchi/binding.schema';

const original: PubchiBindingRecord = {
  id: 'owner:original',
  schema: 'pubchi-owner-binding',
  version: 1,
  owner: 'owner',
  bot: 'original',
  status: 'active',
  created_at: 1,
  updated_at: 1,
};

describe('Pubchi binding session fence', () => {
  beforeEach(async () => {
    process.env[PUBKY_RUNTIME_ENV_NAMES.pubchiEnabled] = 'true';
    resetRuntimeConfigForTests();
    await deletePubchiDatabase();
  });
  afterEach(async () => {
    await deletePubchiDatabase();
    resetPubchiDatabaseForTests();
    delete process.env[PUBKY_RUNTIME_ENV_NAMES.pubchiEnabled];
    resetRuntimeConfigForTests();
  });

  it.each(['upsert', 'replaceActive'] as const)(
    'rolls back %s when its session ends during the local write',
    async (method) => {
      const db = getPubchiDatabase();
      await db.bindings.put(original);
      let current = true;
      db.bindings.hook('creating', () => {
        current = false;
      });
      const assertCurrent = () => {
        if (!current)
          throw Err.auth(AuthErrorCode.SESSION_EXPIRED, 'Session ended', {
            service: ErrorService.Pubchi,
            operation: 'test',
          });
      };
      const next = { ...original, id: 'owner:next', bot: 'next' };
      await expect(PubchiBindingModel[method](next, assertCurrent)).rejects.toMatchObject({
        code: AuthErrorCode.SESSION_EXPIRED,
      });
      await expect(db.bindings.get(next.id)).resolves.toBeUndefined();
      await expect(db.bindings.get(original.id)).resolves.toMatchObject({ status: 'active' });
    },
  );
});
