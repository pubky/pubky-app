import { uuid } from './ring.mjs';

function fixedPrimary(uri) {
  if (typeof uri !== 'string') return null;
  // The browser relay publishes a TCP-shaped address even for a hosted Iroh peer.
  const match = /^(0[23][0-9a-f]{64})@(\[[0-9a-f:]+\]|[a-z0-9.-]+):(\d{1,5})$/i.exec(uri);
  if (!match) return null;
  const [, key, host, portText] = match;
  const port = Number(portText);
  if (port < 1 || port > 65535) return null;
  return { pubkey: key.toLowerCase(), host, port };
}

export function matchesPrimaryPolicy(record, network, primaryUri) {
  const policy = record?.lfbw;
  if (
    !['mainnet', 'testnet', 'regtest'].includes(network) ||
    record?.network !== network ||
    policy?.enabled !== true ||
    (policy.mode !== undefined && policy.mode !== 'external') ||
    policy.primaryWalletId != null ||
    policy.primaryFallbackUri != null
  )
    return false;
  const target = fixedPrimary(primaryUri);
  if (!target) return false;
  const sameKey = (key) => typeof key === 'string' && key.toLowerCase() === target.pubkey;
  const sameUri = (uri) =>
    typeof uri === 'string' && sameKey(uri.slice(0, 66)) && uri.slice(66) === primaryUri.slice(66);
  if (policy.primaryPubkey != null && !sameKey(policy.primaryPubkey)) return false;
  if (policy.primaryUri != null && !sameUri(policy.primaryUri)) return false;
  // Before ranked primaries, the scalar URI identified the only configured peer.
  if (policy.primaries === undefined) return sameUri(policy.primaryUri);
  if (!Array.isArray(policy.primaries) || policy.primaries.length > 1) return false;
  if (policy.primaries.length === 0) return true;
  const [entry] = policy.primaries;
  return sameKey(entry?.pubkey) && sameUri(entry.uri) && entry.fallbackUri == null;
}

export function isMissingPrimary(record) {
  const policy = record?.lfbw;
  return (
    typeof record?.id === 'string' &&
    /^[0-9a-f]{32}$/.test(record.id) &&
    record.status === 'running' &&
    policy?.enabled === true &&
    Array.isArray(policy.primaries) &&
    policy.primaries.length === 0 &&
    policy.primaryUri === null &&
    policy.primaryPubkey === null &&
    policy.setup === 'failed' &&
    policy.setupError === 'No primary node is configured'
  );
}

// A restored wallet can retain its fixed deployment while the engine and its
// registry mirror have both lost the primary. Repair only that exact state.
export async function recoverPrimary(engine, record, network, primaryUri, assertCurrent, binding) {
  if (!isMissingPrimary(record) || !matchesPrimaryPolicy(record, network, primaryUri) || binding?.network !== network)
    return record;
  const transferred = typeof binding?.transferId === 'string' && uuid.test(binding.transferId);
  if (!transferred && binding?.mode !== 'restore') return record;
  const target = fixedPrimary(primaryUri);

  const api = `/wallets/${record.id}/api`;
  assertCurrent();
  const recovery = await engine.request({ method: 'GET', path: api + '/recovery/status' });
  const node = recovery?.node;
  if (
    recovery?.mode !== 'peer-storage' ||
    recovery.state !== 'running' ||
    recovery.importPending !== false ||
    (!transferred && recovery.importComplete !== true) ||
    recovery.restore?.inProgress === true ||
    !['idle', 'applied'].includes(recovery.autoApply?.phase) ||
    !['disabled', 'confirmed'].includes(node?.gate) ||
    node.fenced !== false ||
    node.startupRepairPending !== false ||
    node.backfillLost !== false ||
    node.awaitingDurabilityCount !== 0
  )
    return record;

  assertCurrent();
  const native = await engine.request({ method: 'GET', path: api + '/primaries' });
  if (!Array.isArray(native?.primaries) || native.primaries.length !== 0) return record;
  assertCurrent();
  await engine.request({
    method: 'POST',
    path: api + '/primaries/add',
    body: { ...target, ...(record.lfbw.trusted === false && { trusted: false }) },
  });
  assertCurrent();
  const refreshed = await engine.request({ method: 'GET', path: '/api/wallets/' + record.id });
  assertCurrent();
  return refreshed;
}
