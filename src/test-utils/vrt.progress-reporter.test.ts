import { afterEach, describe, expect, it, vi } from 'vitest';
import type { TestCase, TestModule, TestProject } from 'vitest/node';
import { asOpaque } from '@/test-utils/type-assertions';
import VrtProgressReporter, { readVrtRunTimeoutMs, VRT_PROGRESS_HEARTBEAT_MS } from './vrt.progress-reporter';

afterEach(() => {
  vi.useRealTimers();
});

describe('readVrtRunTimeoutMs', () => {
  it('returns null when the variable is missing, blank, or not a positive integer', () => {
    expect(readVrtRunTimeoutMs({})).toBeNull();
    expect(readVrtRunTimeoutMs({ VRT_RUN_TIMEOUT_MS: '  ' })).toBeNull();
    expect(readVrtRunTimeoutMs({ VRT_RUN_TIMEOUT_MS: '0' })).toBeNull();
    expect(readVrtRunTimeoutMs({ VRT_RUN_TIMEOUT_MS: '18e5' })).toBeNull();
    expect(readVrtRunTimeoutMs({ VRT_RUN_TIMEOUT_MS: '-1' })).toBeNull();
  });

  it('parses a positive integer millisecond budget', () => {
    expect(readVrtRunTimeoutMs({ VRT_RUN_TIMEOUT_MS: '1080000' })).toBe(1_080_000);
    expect(readVrtRunTimeoutMs({ VRT_RUN_TIMEOUT_MS: ' 1500 ' })).toBe(1500);
  });
});

describe('VrtProgressReporter', () => {
  function createReporter(env: { VRT_RUN_TIMEOUT_MS?: string } = {}) {
    const lines: string[] = [];
    const exit = vi.fn();
    const reporter = new VrtProgressReporter({
      env,
      write: (line) => {
        lines.push(line);
      },
      exit,
    });
    return { reporter, lines, exit };
  }

  it('stays silent and arms no timer when the run budget is unset', () => {
    vi.useFakeTimers();
    const { reporter, lines, exit } = createReporter();

    reporter.onInit();
    reporter.onBrowserInit(asOpaque<TestProject>({ name: 'vrt (chromium)' }));
    reporter.onTestModuleStart(asOpaque<TestModule>({ relativeModuleId: 'src/test/vrt/feed/Home.vrt.test.tsx' }));
    vi.advanceTimersByTime(VRT_PROGRESS_HEARTBEAT_MS * 4);

    expect(lines).toEqual([]);
    expect(exit).not.toHaveBeenCalled();
  });

  it('warns and does not exit when the run budget is invalid', () => {
    vi.useFakeTimers();
    const { reporter, lines, exit } = createReporter({ VRT_RUN_TIMEOUT_MS: 'soon' });

    reporter.onInit();
    vi.advanceTimersByTime(60_000);

    expect(lines).toEqual(['[vrt] ignoring invalid VRT_RUN_TIMEOUT_MS=soon\n']);
    expect(exit).not.toHaveBeenCalled();
  });

  it('logs the file and test in progress and exits when the budget elapses', () => {
    vi.useFakeTimers();
    const { reporter, lines, exit } = createReporter({ VRT_RUN_TIMEOUT_MS: '60000' });

    reporter.onInit();
    reporter.onBrowserInit(asOpaque<TestProject>({ name: 'vrt (chromium)' }));
    reporter.onTestModuleQueued(asOpaque<TestModule>({ relativeModuleId: 'src/test/vrt/feed/Home.vrt.test.tsx' }));
    reporter.onTestModuleStart(asOpaque<TestModule>({ relativeModuleId: 'src/test/vrt/feed/Home.vrt.test.tsx' }));
    reporter.onTestCaseReady(
      asOpaque<TestCase>({
        name: 'renders the feed',
        fullName: 'Home feed > renders the feed',
        module: { relativeModuleId: 'src/test/vrt/feed/Home.vrt.test.tsx' },
      }),
    );

    expect(lines).toEqual([
      '[vrt] run budget 60000ms\n',
      '[vrt] browser vrt (chromium) ready, waiting for a file\n',
      '[vrt] queued src/test/vrt/feed/Home.vrt.test.tsx\n',
      '[vrt] start src/test/vrt/feed/Home.vrt.test.tsx\n',
      '[vrt] test src/test/vrt/feed/Home.vrt.test.tsx > Home feed > renders the feed\n',
    ]);

    vi.advanceTimersByTime(VRT_PROGRESS_HEARTBEAT_MS);
    expect(lines.at(-1)).toBe(
      '[vrt] still running (30s, src/test/vrt/feed/Home.vrt.test.tsx > Home feed > renders the feed)\n',
    );

    vi.advanceTimersByTime(VRT_PROGRESS_HEARTBEAT_MS);
    expect(exit).toHaveBeenCalledExactlyOnceWith(1);
    expect(lines.at(-1)).toContain('src/test/vrt/feed/Home.vrt.test.tsx > Home feed > renders the feed');
    expect(lines.at(-1)).toContain('::error title=VRT run timeout::');
  });

  it('does not exit after the run has finished', () => {
    vi.useFakeTimers();
    const { reporter, exit } = createReporter({ VRT_RUN_TIMEOUT_MS: '1000' });

    reporter.onInit();
    reporter.onTestModuleEnd(
      asOpaque<TestModule>({
        relativeModuleId: 'src/test/vrt/feed/Home.vrt.test.tsx',
        state: () => 'passed',
      }),
    );
    reporter.onTestRunEnd();
    vi.advanceTimersByTime(5_000);

    expect(exit).not.toHaveBeenCalled();
  });
});
