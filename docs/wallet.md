# Pubky wallet

Sign in to Pubky and open **Wallet**. Choose a password to encrypt this browser’s wallet. The wallet checks for an existing Ring wallet for this identity and Bitcoin network. Choose **Recover with Ring** on a replacement device or **Create with Ring** for first use. Choose **Use a recovery phrase instead** for an independent wallet. Existing wallets keep their original backup method. On return, use the same Pubky account, browser profile and site origin. A Vibes board frame opens the wallet in its own tab so the browser always uses the same storage partition.

**Send** and **Receive** open as soon as the wallet unlocks and verifies device access. While it connects, you can enter or scan a destination, draft a request, or open a saved receipt. Review becomes available when the engine finishes startup. Your draft stays in place, including after a connection retry. Use the back arrow to return to your balance and Activity.

In **Receive**, leave the amount blank or enter `0`, then choose **Review request** to let the sender set the amount. This works for a first Lightning invoice when the primary can quote its fee and payment limit. Enter a positive whole amount to review a fixed invoice. When your primary needs to provide inbound capacity, review the Lightning payment limit and any opening fee before sharing the request. The wallet can negotiate a smaller limit if the primary has less bitcoin available. Share its QR or copy the unified Bitcoin request for a payer choosing between Lightning and on-chain payment. Keep the wallet open and unlocked to accept an ordinary Lightning payment. **Receive on-chain** generates a watched Bitcoin address and QR.

For a Lightning payment that can arrive after you close the wallet, switch on **Receive offline**. Enter a fixed amount within the displayed range, review the terms, and create the invoice while connected. Once the QR appears, share it and close the wallet. The payer can pay the Lightning invoice until the expiry shown. Your primary must offer offline settlement, and your wallet needs an eligible channel with enough inbound capacity. A new wallet without a channel can still create an ordinary invoice.

Reopen and unlock the same wallet to check the payment. **Activity** shows the verified receipt and the balance updates from the channel ledger. A payment first verified on return can say **Received while you were away**. To share a pending offline invoice again before it expires, open its Activity receipt and choose **Show invoice**. If creation was interrupted before the QR appeared, **Resume offline request** in Receive retries the same request with the same primary.

**Send** takes an invoice, Bitcoin address, BIP21 request, or Pubky ID. Review the destination, payment method, amount and fees, then confirm. Tap any payment or request in **Activity** to open its receipt. A pending payment updates in place when it settles, even with the receipt open. Receipts distinguish estimated fees from reported fees. Checkmark and balance animations respect reduced motion.

**Max** asks the engine for a new quote for the scanned or pasted destination. Fixed invoices keep the amount chosen by the recipient. An amountless Lightning invoice can receive the full channel balance, including fees in the reviewed debit. For a Bitcoin address, Max normally pays the recipient from the channel and keeps the channel open. Whole-wallet Max checks for funds outside that payment. If a channel reserve or other coins would remain, an address without a requested amount can instead use **Empty wallet to this address**. Review its cooperative channel close, any sweep of loose coins, estimated payout and fees before confirming. Coins that arrive after the review stay in the wallet.

**Pay** on a profile opens Send with that Pubky ID. Review looks up the recipient’s public Paykit list and prefers a current BOLT11 invoice, followed by a compatible address on this wallet’s network. The recipient’s homeserver supplies the payment details. If the profile has no payable endpoint, ask the recipient to share a request from Receive. Creating a wallet does not publish a payment address on the user’s profile.

## Run it locally

The app includes the browser worker and a small Node relay. The operator supplies an Electrum server and a reachable Lightning peer on the same Bitcoin network. To receive into an empty wallet, the peer needs liquidity and Beignet JIT receiving enabled. An existing funded channel can receive up to its available inbound capacity.

1. Use Node 24 and run `npm ci`.
2. Create `.env.local` in this checkout. For a regtest setup with Electrum on port 60001, use the settings below. Replace the primary public key and port with your node’s actual advertised identity and TCP endpoint. Generate the relay secret with `openssl rand -hex 32`.

   ```dotenv
   WALLET_NETWORK=regtest
   WALLET_PRIMARY_URI=<compressed-peer-public-key>@127.0.0.1:9735
   WALLET_ELECTRUM=tcp://127.0.0.1:60001
   WALLET_APP_ORIGIN=http://127.0.0.1:3000
   WALLET_RELAY_ORIGIN=ws://127.0.0.1:8790
   WALLET_RELAY_SECRET=<64-hex-characters>
   ```

3. Run `node --env-file=.env.local scripts/wallet/relay.mjs` in one terminal and `npm run dev` in another. Open [the local wallet](http://127.0.0.1:3000/wallet) and sign in through Pubky. The default Pubky staging settings and the wallet’s Bitcoin network are independent.

## Host the wallet

Serve the app over HTTPS on a stable origin. Set `WALLET_APP_ORIGIN` to the literal HTTPS app origin and `WALLET_RELAY_ORIGIN` to the public WSS relay origin. The browser receives a 15-minute transport ticket which the worker renews while open.

For standalone hosting, run the Node relay on a host that can reach both configured upstreams. Put a TLS reverse proxy in front of its loopback port (8790 by default, configurable through `WALLET_RELAY_PORT`). Forward WebSocket upgrades for `/peer` and `/electrum`. Supply matching primary, network, origins and `WALLET_RELAY_SECRET` to the app server and relay. They use this shared secret to issue and verify HMAC tickets.

For zero-reserve receiving channels, set `BEIGNET_WAIVE_CLIENT_RESERVE=true` on the Beignet primary before the wallet requests a new, private just-in-time (JIT) receiving channel. A manual channel to a trusted peer alone does not qualify for the waiver. The embedded wallet advertises this feature and keeps the primary's reserve intact. The primary must monitor revoked commitments and enforce the penalty within the channel delay. Existing channels keep their negotiated terms, and a wallet that opened a channel must still cover its commitment costs. [Beignet zero-reserve policy](https://github.com/coreyphillips/beignet/blob/v0.43.6/docs/ZERO-RESERVE.md)

Set `WALLET_ELECTRUM` to a `tls://host:port` URL for a TLS Electrum server. The relay verifies its certificate. For a primary behind Tor or another tunnel, configure a fixed local forward and set `WALLET_PEER_TUNNEL=tcp://127.0.0.1:<forwarded-port>`. Keep the primary’s real identity in `WALLET_PRIMARY_URI`. The peer authenticates over BOLT8. The relay can observe Electrum requests and network metadata.

On Vercel, the included `/peer` and `/electrum` Node functions serve the relay on the app's own domain. Use `WALLET_RELAY_ORIGIN=wss://<app-host>`. Vercel provides the shared ticket store. The issuer generates a random token and stores its absolute expiry under a SHA-256 digest of that token and the deployment settings. Both relay functions verify the origin and look up that digest in the same `iad1` Runtime Cache. Expired or evicted entries require a fresh ticket. The hosted setup requires the network, primary, Electrum and origins, with no relay secret to provision.

A primary using Chicory's relay-only Iroh link accepts its full `<lightning-key>@iroh:<endpoint-id>?relay=<encoded-https-origin>` as `WALLET_PRIMARY_URI`. The relay opens an authenticated Iroh stream for the selected endpoint. The browser authenticates the selected Lightning key over BOLT8 inside that stream. Connections can reopen when the hosted function duration expires.

The grant endpoint is public and permits transport to the two fixed upstreams. Use your proxy’s connection and rate limits for a public deployment. A static page host alone cannot run the relay. The fork can be listed in the Vibes registry once it has a stable reachable HTTPS deployment.

## Staging and locked posts

The hosted wallet uses Bitcoin mainnet with Chicory mobile’s Iroh primary and TLS Electrum. Pubky identities, posts and Locks use the Pubky staging services. The network badge in Wallet identifies the network that holds the money.

On a return visit, the visible password screen prepares two short-lived Electrum connections for the network check and the wallet scan. On the hosted mainnet relay they can also begin public network checks, including reading the Bitcoin genesis header and negotiating the Electrum protocol. The engine validates the replies from those connections. Wallet addresses and balances are queried after unlock and, for Ring wallets, the device check. The wallet starts opening its fixed Lightning relay connection as soon as engine startup is authorized, while restoring the node and checking Bitcoin. Beignet authenticates the peer. The dashboard rereads the wallet when the primary connects or disconnects. Payment review uses the live wallet.

On unlock the engine restores the saved address indexes and transaction history, checks receive and change address windows, verifies coins and recent transactions, and renews address subscriptions. For a small history on the hosted mainnet Electrum server, the initial scan sends its usual 20-entry batches closer together. If the initial scan is still running, the wallet waits for its result. A failed scan can retry at the server’s normal pace before payment review becomes available.

Locks delivers a purchase request privately to the reader’s registered Paykit wallet. Bitkit accepts the request and the Lock Server verifies its settlement before issuing access to the post. On a deployment where the wallet and Locks use the same Bitcoin network, the purchase dialog can look up the reader’s own public Bitkit address, quote a top-up and send it after confirmation. The reader then confirms the purchase in Bitkit. Set `WALLET_LOCKS_NETWORK` to the Bitcoin network used by the deployment’s Paykit Server. The hosted staging instance sets it to `regtest`, so readers use regtest Bitkit for locked posts and their mainnet wallet stays out of that checkout.

## Storage and recovery

On browsers with a large saved wallet, the worker keeps an encrypted snapshot and saves the database pages that changed. Each update reaches local storage before the engine acknowledges it. If the browser quits unexpectedly, the next unlock verifies the snapshot and restores the last committed update. Locking the wallet normally writes a complete snapshot that older wallet versions can also open.

**Ring recovery.** A compatible Ring signer explicitly approves the one-file scope `/priv/pubky-wallet/v1/<network>/wallet-key:e`. This permission lets the approved browser derive spending keys. Only approve it from the wallet you intend to use. The identity secret stays in Ring. This flow requests a fresh signed approval in memory, revokes its temporary grant, then transfers the scoped key into the wallet worker. The ordinary Pubky sign-in has its own grant. [Ring encryption approvals](https://github.com/pubky/pubky-ring/pull/387)

V1 uses HKDF-SHA256 with the 32-byte scoped key, the UTF-8 salt `pubky.app/bitcoin-wallet/ring-seed/v1` and the UTF-8 network name, a NUL byte and the bare z-base-32 Pubky as the `info` field. The 32-byte result is English BIP39 entropy for Beignet. The same identity and network reproduce the same Bitcoin keys on a new browser. Keep your Ring identity backed up. A second Bitcoin recovery phrase is unnecessary for this option.

A private registration in `/priv/app.pubky/v1/wallet/<network>/device.json` records the owning device and setup mode. The homeserver grants an exclusive write lock while the wallet runs. A second browser requires explicit recovery with the original wallet closed. The original device can no longer open the wallet after a completed handover. An unavailable homeserver pauses Ring-wallet access. On a new device the recovery peer supplies encrypted channel backups. An absent or stale backup can keep Lightning funds on hold. Use one device at a time. [Beignet recovery protocol](https://github.com/coreyphillips/beignet/blob/v0.43.6/docs/RECOVERY-PROTOCOL.md)

**Independent recovery.** The Bitcoin seed belongs to this wallet, independently of the Pubky Ring identity. The worker encrypts the seed, wallet database, live channel state and last verified total under the wallet password in browser-private files. On a return visit, the wallet can show that total and its timestamp as soon as the password unlocks local storage. After device access checks, you can draft payments while the engine syncs. The live balance and payment review become available when Bitcoin and Lightning are ready. An exclusive handle prevents two tabs from operating the same vault. Locking, signing out, or leaving the wallet closes that session. Returning to the same account unlocks the saved vault.

Clearing site data removes the local vault. Write down the recovery words before funding. Seed recovery restores derived keys. Recovering open channels also depends on up-to-date channel recovery data and the recovery peer. Close the original wallet before restoring it elsewhere. A browser may suspend background pages.

If the browser closes during a confirmed send or loses its result, the next unlock shows a reminder in **Activity**. Check the payment and confirm with the recipient if its outcome is unclear. **I checked Activity** dismisses the reminder. The payment record and its status stay in Activity.

The portable engine is built from Beignet 0.43.6. [Pinned sources and reproducible build](../vendor/README.md)

## Verify the integration

```sh
npm run typecheck
npm test -- src/components/templates/Wallet src/libs/wallet
node --test scripts/wallet/*.test.mjs
npm run build
```

To check the actual browser worker against your local regtest peer, install Playwright Chromium, set `WALLET_SMOKE_PRIMARY` to the peer’s public key and loopback port in `pubkey@127.0.0.1:port` form, and run `npm run test:wallet:browser`. The smoke test uses a fresh browser profile. Override `WALLET_SMOKE_ELECTRUM_PORT` if your regtest Electrum uses a port other than 60001.
