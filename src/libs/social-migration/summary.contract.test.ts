// @vitest-environment node
import { skipReasons } from 'pubky-social-migrator';
import { describe, expect, it } from 'vitest';
import { SOCIAL_MIGRATION_SKIP_OUTCOMES } from './summary';

describe('social migration summary against pubky-social-migrator', () => {
  it('counts every skip reason the engine reports but `not_migrated`, plus a refused PUT', () => {
    const expected = [...skipReasons.filter((reason) => reason !== 'not_migrated'), 'put_rejected'];
    expect([...SOCIAL_MIGRATION_SKIP_OUTCOMES].sort()).toEqual(expected.sort());
  });
});
