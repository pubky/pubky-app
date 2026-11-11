import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test as base } from '@playwright/test';
import { config as loadEnv } from 'dotenv';
import { type E2eStackConfig, e2eStackConfigFromEnv, fetchSignupToken } from '../../e2e/shared/homeserver';
import { createNexusTasks } from '../../e2e/shared/nexus';
import { createSeedTasks } from '../../e2e/shared/seed';
import type { NexusCheck } from '../../e2e/shared/types/nexus';
import type { SeedCreatePostArgs, SeededPost, SeededUser } from '../../e2e/shared/types/seed';
import { prepareContext } from './navigation';

loadEnv();

const NEXUS_WAIT_MS = 60_000;

export type SeedApi = {
  config: E2eStackConfig;
  signupToken: () => Promise<string>;
  createUser: (name: string, options?: { bio?: string; withRecoveryFile?: boolean }) => Promise<SeededUser>;
  createPost: (args: SeedCreatePostArgs) => Promise<SeededPost>;
  recoveryFile: (userId: string) => string;
  wait: (...checks: NexusCheck[]) => Promise<unknown[]>;
};

type Fixtures = {
  seed: SeedApi;
};

export const test = base.extend<Fixtures>({
  context: async ({ context }, run) => {
    await prepareContext(context);
    await run(context);
  },
  // One seed client per test. Sessions stay in this process, the same way the Cypress tasks do,
  // and are thrown away with the test. Recovery files are the sign-in fixture; nothing is written
  // to storageState. The callback is named `run` so the React hooks lint rule does not treat it
  // as a hook.
  seed: async ({}, run) => {
    const stack = e2eStackConfigFromEnv(process.env);
    const tasks = createSeedTasks(stack);
    const nexus = createNexusTasks(stack.nexusUrl);
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'playwright-recovery-'));
    const files = new Map<string, string>();
    const api: SeedApi = {
      config: stack,
      signupToken: () => fetchSignupToken(stack.homeserverAdminUrl, stack.homeserverAdminPassword),
      createUser: async (name, options = {}) => {
        const recoveryFilePath = options.withRecoveryFile
          ? path.join(dir, `${name.replace(/[^\w.-]+/g, '_')}.pkarr`)
          : undefined;
        const user = await tasks.seedCreateUser({
          name,
          bio: options.bio ?? '',
          recoveryFilePath,
        });
        if (recoveryFilePath) files.set(user.id, recoveryFilePath);
        return user;
      },
      createPost: (args) => tasks.seedCreatePost(args),
      recoveryFile: (userId) => {
        const filePath = files.get(userId);
        if (!filePath) throw new Error(`no recovery file for ${userId}`);
        return filePath;
      },
      wait: (...checks) => nexus.nexusWaitAll({ checks, timeoutMs: NEXUS_WAIT_MS }),
    };
    try {
      await run(api);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  },
});

export { expect } from '@playwright/test';
