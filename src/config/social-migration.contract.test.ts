// @vitest-environment node
import { MemoryPort, runMigration, transformRev } from 'pubky-social-migrator';
import { fakeOwner } from 'pubky-social-specs/testing';
import { describe, expect, it } from 'vitest';
import { SOCIAL_MIGRATION_FLAG_PATH, SOCIAL_MIGRATION_TRANSFORM_REV } from '@/config/social-migration';

describe('social migration config against pubky-social-migrator', () => {
  it('mirrors the transform revision the engine records in the done flag', () => {
    expect(SOCIAL_MIGRATION_TRANSFORM_REV).toBe(transformRev);
  });

  it('names the flag the engine writes, so the gate reads what a finished run left', async () => {
    const owner = fakeOwner(1);
    const port = new MemoryPort();

    const report = await runMigration({ owner, port });

    expect(report.status).toBe('done');
    const written = [...port.store.keys()];
    expect(written).toEqual([`pubky://${owner}${SOCIAL_MIGRATION_FLAG_PATH}`]);
    const flag = JSON.parse(new TextDecoder().decode(port.store.get(written[0])));
    expect(flag.transform_rev).toBe(SOCIAL_MIGRATION_TRANSFORM_REV);
  });
});
