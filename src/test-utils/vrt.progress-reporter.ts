import { writeSync } from 'node:fs';
import type { Reporter, TestCase, TestModule, TestProject } from 'vitest/node';

/**
 * CI-only progress log and run watchdog for the VRT project.
 *
 * The default reporter prints a file when it finishes. A stall before that
 * (browser launch, module import, a stuck orchestrator) leaves an empty log,
 * and a runner that then stops heartbeating publishes nothing. When
 * `VRT_RUN_TIMEOUT_MS` is set, this reporter writes each file and test to
 * stderr as it starts and exits the process at the budget, so the step can
 * end and the failure-screenshot upload can run. Lines go out with
 * `writeSync` so a later stuck event loop cannot hold them in a buffer.
 * Unset (local `npm run test:vrt`) it stays silent and arms no timer.
 *
 * Per-test, hook, and teardown timeouts still bound work inside a test. This
 * covers a stall that never enters one. The timer is unref'd so it cannot
 * recreate the shutdown wait the `@vitest/browser` patch removes.
 */

/** How often a budgeted run announces that it is still alive. */
export const VRT_PROGRESS_HEARTBEAT_MS = 30_000;

const TIMEOUT_ENV = 'VRT_RUN_TIMEOUT_MS';

/** The only variable this reporter reads. Kept narrow so tests can pass a partial env. */
export type VrtTimeoutEnv = {
  VRT_RUN_TIMEOUT_MS?: string;
};

export type VrtProgressReporterDeps = {
  env?: VrtTimeoutEnv;
  write?: (line: string) => void;
  exit?: (code: number) => void;
};

/** Positive integer milliseconds, or null when the variable is unset or invalid. */
export function readVrtRunTimeoutMs(env: VrtTimeoutEnv): number | null {
  const raw = env[TIMEOUT_ENV];
  if (raw == null) return null;
  const trimmed = raw.trim();
  if (!/^[0-9]+$/.test(trimmed)) return null;
  const ms = Number(trimmed);
  if (!Number.isSafeInteger(ms) || ms <= 0) return null;
  return ms;
}

export default class VrtProgressReporter implements Reporter {
  private readonly env: VrtTimeoutEnv;
  private readonly writeLine: (line: string) => void;
  private readonly exitProcess: (code: number) => void;
  private enabled = false;
  private startedAt = 0;
  private current = 'starting (no file yet)';
  private heartbeat: ReturnType<typeof setInterval> | undefined;
  private watchdog: ReturnType<typeof setTimeout> | undefined;

  constructor(deps: VrtProgressReporterDeps = {}) {
    this.env = deps.env ?? { VRT_RUN_TIMEOUT_MS: process.env.VRT_RUN_TIMEOUT_MS };
    this.writeLine = deps.write ?? ((line) => writeSync(2, line));
    this.exitProcess = deps.exit ?? ((code) => process.exit(code));
  }

  onInit(): void {
    this.disarm();
    const raw = this.env[TIMEOUT_ENV];
    if (raw == null || raw.trim() === '') return;

    const timeoutMs = readVrtRunTimeoutMs(this.env);
    if (timeoutMs == null) {
      this.write(`ignoring invalid ${TIMEOUT_ENV}=${raw.trim()}`);
      return;
    }

    this.enabled = true;
    this.startedAt = Date.now();
    this.heartbeat = setInterval(() => {
      this.write(`still running (${this.elapsedSeconds()}s, ${this.current})`);
    }, VRT_PROGRESS_HEARTBEAT_MS);
    this.heartbeat.unref?.();
    this.watchdog = setTimeout(() => {
      const message =
        `VRT run exceeded ${timeoutMs}ms while ${this.current}. ` +
        'Exiting so CI can flush logs and upload failure screenshots.';
      this.writeLine(`::error title=VRT run timeout::${message}\n`);
      this.exitProcess(1);
    }, timeoutMs);
    this.watchdog.unref?.();
    this.write(`run budget ${timeoutMs}ms`);
  }

  onBrowserInit(project: TestProject): void {
    if (!this.enabled) return;
    this.current = `browser ${project.name} ready, waiting for a file`;
    this.write(this.current);
  }

  onTestModuleQueued(testModule: TestModule): void {
    if (!this.enabled) return;
    this.current = `${testModule.relativeModuleId} (queued)`;
    this.write(`queued ${testModule.relativeModuleId}`);
  }

  onTestModuleStart(testModule: TestModule): void {
    if (!this.enabled) return;
    this.current = `${testModule.relativeModuleId} (running)`;
    this.write(`start ${testModule.relativeModuleId}`);
  }

  onTestCaseReady(testCase: TestCase): void {
    if (!this.enabled) return;
    this.current = `${testCase.module.relativeModuleId} > ${testCase.fullName}`;
    this.write(`test ${this.current}`);
  }

  onTestModuleEnd(testModule: TestModule): void {
    if (!this.enabled) return;
    this.write(`end ${testModule.relativeModuleId} (${testModule.state()})`);
  }

  onTestRunEnd(): void {
    this.disarm();
  }

  private elapsedSeconds(): number {
    return Math.round((Date.now() - this.startedAt) / 1000);
  }

  private write(line: string): void {
    this.writeLine(`[vrt] ${line}\n`);
  }

  private disarm(): void {
    this.enabled = false;
    if (this.heartbeat) clearInterval(this.heartbeat);
    if (this.watchdog) clearTimeout(this.watchdog);
    this.heartbeat = undefined;
    this.watchdog = undefined;
  }
}
