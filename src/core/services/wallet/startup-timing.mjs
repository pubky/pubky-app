/** Created only for a local diagnostic unlock. Each phase crosses the worker boundary once. */
export function createStartupTiming() {
  const reported = new Set();
  let requestedAt;
  let saveMs = 0;

  function report(phase, durationMs) {
    if (reported.has(phase)) return;
    reported.add(phase);
    self.postMessage({ event: 'startup-timing', phase, ...(durationMs === undefined ? {} : { durationMs }) });
  }

  return {
    beginStart() {
      if (requestedAt !== undefined || reported.has('engine-start')) return;
      requestedAt = performance.now();
      saveMs = 0;
      return (succeeded) => {
        if (succeeded) {
          const durationMs = Math.round(performance.now() - requestedAt);
          report('vault-writes', Math.round(saveMs));
          report('engine-start', durationMs);
        }
        requestedAt = undefined;
      };
    },
    beginSave() {
      if (requestedAt === undefined) return;
      const writingAt = performance.now();
      return () => {
        saveMs += performance.now() - writingAt;
      };
    },
    engineStep(message) {
      // Graph restoration can finish after the start request. Drop the SDK's
      // trailing graph statistics and allow the duration to be absent.
      const graph = /^restore-graph (\d{1,15})ms(?: |$)/.exec(message);
      if (graph) return report('routing-graph-restored', Number(graph[1]));
      if (
        message === 'restore-graph' ||
        /^restore-graph (?:busy|slices|channels|nodes|load|add|restore|construct) \d/.test(message)
      )
        return report('routing-graph-restored');
      const match = /^(create|initial-sync) (\d{1,15})ms$/.exec(message);
      if (!match) return;
      const durationMs = Number(match[2]);
      if (match[1] === 'initial-sync') return report('initial-sync', durationMs);
      if (requestedAt !== undefined) {
        // In the pinned engine genesis verification and its registry save immediately
        // precede timed node creation. This is the caller-visible preflight estimate.
        const preflight = Math.round(performance.now() - requestedAt) - durationMs;
        if (preflight >= -1) report('electrum-verification', Math.max(0, preflight));
      }
      report('node-restore', durationMs);
    },
    primaryConnected: () => report('first-primary-connected'),
    channelUsable: () => report('first-channel-usable'),
  };
}
