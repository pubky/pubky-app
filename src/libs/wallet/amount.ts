/** BIP 177 displays the on-chain integer unit directly. BTC in a BIP21 URI keeps its protocol meaning. */
export function bitcoinAmount(amount: number | bigint) {
  return `₿${amount.toLocaleString('en-US')}`;
}

/** Preserve exact sub-unit Lightning settlement without converting a millisatoshi string through Number. */
export function lightningAmount(msats: string) {
  const value = BigInt(msats);
  const msatsPerUnit = BigInt(1000);
  const remainder = value % msatsPerUnit;
  if (!remainder) return bitcoinAmount(value / msatsPerUnit);
  if (value < msatsPerUnit) return `${remainder} msat`;
  return `${bitcoinAmount(value / msatsPerUnit)} + ${remainder} msat`;
}

/** Translate amounts in wallet-engine status copy. User-entered descriptions and payment payloads stay verbatim. */
export function walletMessage(text: string) {
  return text
    .replace(/\b(\d[\d,]*(?:\.\d+)?) sats?\b/gi, (_match, amount: string) => `₿${amount}`)
    .replace(/\ba whole number of sats\b/gi, 'a whole ₿ amount');
}
