const path = '/pubky/last-balance-v1.json';
const encoder = new TextEncoder();
const decoder = new TextDecoder();

function read(volume, name) {
  let bytes;
  try {
    bytes = volume.read(name);
    if (!(bytes instanceof Uint8Array)) return null;
    return JSON.parse(decoder.decode(bytes));
  } catch {
    return null;
  } finally {
    if (bytes instanceof Uint8Array) bytes.fill(0);
  }
}

function validTime(value) {
  return Number.isSafeInteger(value) && value > 0 && value <= Date.now();
}

function matchesWallet(volume, balance) {
  if (
    !balance ||
    typeof balance.walletId !== 'string' ||
    !/^[0-9a-f]{32}$/.test(balance.walletId) ||
    !['mainnet', 'testnet', 'regtest'].includes(balance.network) ||
    !Number.isSafeInteger(balance.totalSats) ||
    balance.totalSats < 0 ||
    balance.totalSats > 21_000_000 * 100_000_000
  )
    return false;
  const record = read(volume, '/wallet/registry.json')?.record;
  return record?.id === balance.walletId && record.network === balance.network;
}

export function lastBalance(volume) {
  const value = read(volume, path);
  if (value?.version !== 1 || !validTime(value.updatedAt) || !matchesWallet(volume, value)) {
    return null;
  }
  const { walletId, network, totalSats, updatedAt } = value;
  return { walletId, network, totalSats, updatedAt };
}

export function rememberBalance(volume, balance) {
  if (!matchesWallet(volume, balance)) throw new Error('The balance does not match this wallet.');
  const { walletId, network, totalSats } = balance;
  const previous = read(volume, path);
  if (
    previous?.version === 1 &&
    previous.walletId === walletId &&
    previous.network === network &&
    previous.totalSats === totalSats &&
    validTime(previous.updatedAt)
  )
    return;
  // Updating a file commits the entire encrypted vault. Skip unchanged polling results.
  volume.write(
    path,
    encoder.encode(JSON.stringify({ version: 1, walletId, network, totalSats, updatedAt: Date.now() })),
  );
}
