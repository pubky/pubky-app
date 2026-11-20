# Pubky wallet

Sign in to Pubky and open **Wallet**. Choose a wallet password, create a wallet, and record the recovery words. On return, use the same Pubky account, browser profile and site origin. A Vibes board frame opens the wallet in its own tab so the browser always uses the same storage partition.

**Receive** quotes any inbound liquidity fee before creating a Lightning invoice. Share its QR or copy the unified Bitcoin request for a payer choosing between Lightning and on-chain payment. Keep the wallet page open and unlocked for Lightning receives and channel monitoring. **Send** takes an invoice, Bitcoin address, BIP21 request, or Pubky ID. Review the destination, payment method, amount and fees, then confirm. Activity shows pending and settled outcomes.

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

Serve the app over HTTPS on a stable origin. Run the relay as a persistent Node process on the host with access to the two configured upstreams. Put a TLS reverse proxy in front of its loopback port (8790 by default, configurable through `WALLET_RELAY_PORT`). Forward WebSocket upgrades for `/peer` and `/electrum`. Set `WALLET_APP_ORIGIN` to the literal HTTPS app origin and `WALLET_RELAY_ORIGIN` to the public WSS relay origin. Supply the same secret, primary, network and origins to the app server and relay. Keep the secret in server-side environment variables. The browser receives a 15-minute grant which the worker renews while open.

Set `WALLET_ELECTRUM` to a `tls://host:port` URL for a TLS Electrum server. The relay verifies its certificate. For a primary behind Tor or another tunnel, configure a fixed local forward and set `WALLET_PEER_TUNNEL=tcp://127.0.0.1:<forwarded-port>`. Keep the primary’s real identity in `WALLET_PRIMARY_URI`. The peer authenticates over BOLT8. The relay can observe Electrum requests and network metadata.

The grant endpoint is public and permits transport to the two fixed upstreams. Use your proxy’s connection and rate limits for a public deployment. A static page host alone cannot run the relay. The fork can be listed in the Vibes registry once it has a stable reachable HTTPS deployment.

## Storage and recovery

The Bitcoin seed belongs to this wallet, independently of the Pubky Ring identity. The worker encrypts the seed, wallet database and live channel state under the wallet password in browser-private files. An exclusive handle prevents two tabs from operating the same vault. Locking, signing out, or leaving the wallet closes that session. Returning to the same account unlocks the saved vault.

Clearing site data removes the local vault. Write down the recovery words before funding. Seed recovery restores derived keys. Recovering open channels also depends on up-to-date channel recovery data and the recovery peer. Close the original wallet before restoring it elsewhere. A browser may suspend background pages.

The portable engine is built from Beignet 0.43.6. [Pinned sources and reproducible build](../vendor/README.md)

## Verify the integration

```sh
npm run typecheck
npm test -- src/components/templates/Wallet src/libs/wallet
node --test scripts/wallet/relay.test.mjs
npm run build
```

To check the actual browser worker against your local regtest peer, install Playwright Chromium, set `WALLET_SMOKE_PRIMARY` to the peer’s public key and loopback port in `pubkey@127.0.0.1:port` form, and run `npm run test:wallet:browser`. The smoke test uses a fresh browser profile. Override `WALLET_SMOKE_ELECTRUM_PORT` if your regtest Electrum uses a port other than 60001.
