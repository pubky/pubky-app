# Locks: reader flow

How a reader unlocks and reads locked content in pubky-app, screen by screen, and what each screen
means. Written for someone who runs the app and needs to know whether what they see is normal. The
creator side is in [`creator-flow.md`](creator-flow.md).

Companions:

- [`../locks.md`](../locks.md) — how it works inside the app ("Reading a lock post").
- [`locks-local-stack/README.md`](locks-local-stack/README.md) — running the stack locally and paying from
  the terminal.
- `pubky/flow-inspectorate` → `docs/manual-e2e-locks-ring-bitkit.md` — what to do inside Bitkit at each
  step. That document refers to the scenario ids used here (C-1, C-4, C-6, D-5, ...).

Checked against `dev` at `d061f40f8` on 2026-10-19
(`@synonymdev/locks-sdk` `0.1.0`).

## The parts

| Part            | Role for the reader                                                                                                                  |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| **pubky-app**   | The lock card, the Pay to Unlock modal, the Unlocked tab. Holds no keys and no money. It never sees an invoice or an address.        |
| **Lock Server** | Receives the unlock request, has Paykit create the payment request, verifies the payment, and hands out the content once it is paid. |
| **Paykit**      | Delivers the payment request to the reader's Bitkit over a private link between reader and creator.                                  |
| **Bitkit**      | The reader's wallet. Receives the payment request and pays it.                                                                       |
| **Pubky Ring**  | Only for signing in, and once for old sessions (#2373). A phone also offers Bitkit for both (#2833, #2842). Never part of a payment. |

The pubky.app account and the Bitkit wallet must be the **same key**: the reader's pubky is the address
the payment request is delivered to.

## Before you start

1. A reader account and a Bitkit wallet restored from the same recovery phrase, with enough balance to
   pay the price. Bitkit setup is in the flow-inspectorate document (S-2 to S-4).
2. A creator account that has published a locked post (`creator-flow.md`, A-2).
3. A desktop browser (1024px or wider) and a real phone. The handoff to Bitkit differs: a QR on desktop,
   a button on the phone.
4. Two browsers, or a normal window plus a private one, so both accounts are signed in at once.
5. On the local stack there is no Bitkit. The runbook receives and pays the request from the terminal
   (section 10).

## Where the data lives

- The content a reader unlocked is copied into the reader's own homeserver `/priv` area. Later views
  read that copy; the Lock Server is not involved again, and the copy survives the creator revoking or
  deleting the lock.
- A purchase in progress is remembered as a small file per purchase id in the same area, in a folder
  for that lock (#2831). It is the only handle to a payment, so the app writes it before it submits
  anything, and refuses to pay when it cannot read it.

## The happy path (first unlock from a creator, desktop)

| #   | You do                                                                                                                         | You see                                                                                                                                                                                                                             | What is happening                                                                                                                                                                       |
| --- | ------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Open the teaser.                                                                                                               | The teaser text, then the lock card: title, **Unlock**, the price.                                                                                                                                                                  | The app fetched the public `lock.json` for the BTC or USD price.                                                                                                                        |
| 2   | Press **Unlock**.                                                                                                              | The button slides over the price. The **Pay to Unlock** modal opens with the title, the creator's avatar, **COST TO UNLOCK** and a spinner. After submission: "Checking your Bitkit connection…" until the first link read answers. | The app reads the reader's purchase record, checks that Bitkit (Paykit) is set up for this pubky, then mints a purchase id, saves it and submits the unlock request. No confirm button. |
| 3   | A QR appears with "If this creator is not in your Bitkit contacts, scan this code to add them." Scan it with Bitkit if needed. | Above the QR: "Your Bitkit connection to this creator is not ready yet. Keep Bitkit open." or "Connecting to this creator. Keep Bitkit open." The latter has a small spinner while polling is active.                               | The QR encodes the **creator's** pubky and stays available until the link is connected. Link state does not prove whether the reader scanned it.                                        |
| 4   | Keep Bitkit open. Review and approve the payment request when it appears.                                                      | The QR disappears. A spinner with "Check Bitkit for a payment request. Review and confirm it there when it appears." Desktop and phone use the same text, without an AWAITING PAYMENT label.                                        | The link is connected; that alone does not confirm delivery of the payment request. The app polls the Lock Server every 3 seconds.                                                      |
| 5   | Wait for the paid content.                                                                                                     | **PAYMENT RECEIVED**, "Opening your content…" and a spinner; then "Thank you for supporting creators!" (desktop prefixes "Unlocked."), a check mark and **View Content**.                                                           | The Lock Server verified payment, then the app downloaded the content. The private copy starts at step 6.                                                                               |
| 6   | Press **View Content**.                                                                                                        | The content in place of the lock card, with the label **Unlocked**.                                                                                                                                                                 | The content is shown from memory, then copied to the reader's `/priv` in the background. Closing the paid modal does the same.                                                          |

On a phone step 3 shows an **Open in Bitkit** button instead of the QR, under "If this creator is not
in your Bitkit contacts, add them." It opens `bitkit://contact?pubky=<creator pubky, prefixed form>`,
the same screen a scan reaches.

The second unlock from the same creator skips step 3 when the existing link reads as connected:
after "Checking your Bitkit connection…", the modal goes straight to "Check Bitkit for a payment
request. Review and confirm it there when it appears."

## Screens you may meet in the modal

The modal has no confirm step. Everything after opening it is automatic until the payment request is
in Bitkit.

| Screen                                                                                                                        | Meaning                                                                                                                                                                                                                                               | Normal?                                                  | What to do                                                                                                                                                                                                                                                 |
| ----------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Spinner, no buttons but Cancel                                                                                                | Reading the saved purchase records, checking the wallet, then submitting. Closing after the submission started asks for confirmation.                                                                                                                 | Yes, for a moment                                        | Wait.                                                                                                                                                                                                                                                      |
| Three steps "Install Bitkit / Set up profile / Fund wallet", store badges, **I completed the steps**                          | The reader's homeserver has no Paykit data: Bitkit is not set up for **this** pubky. Nothing was submitted and no request reaches any wallet.                                                                                                         | Yes, for a reader without Bitkit                         | Set Bitkit up with the same recovery phrase, then press the button. Closing here asks nothing.                                                                                                                                                             |
| Toast "Bitkit is not set up yet. Finish the steps, then try again." after that button                                         | The check ran again and still found no Paykit data.                                                                                                                                                                                                   | Yes                                                      | Finish the Bitkit setup. If Bitkit uses a different pubky, this never clears (known gap).                                                                                                                                                                  |
| Spinner with "Checking your Bitkit connection…"                                                                               | Submitted; the first link read has not answered yet. A failed first read keeps this state until one succeeds, the purchase ends or polling parks.                                                                                                     | Yes, for a moment                                        | Wait.                                                                                                                                                                                                                                                      |
| QR with "If this creator is not in your Bitkit contacts, scan this code to add them." (desktop) or **Open in Bitkit** (phone) | Submitted. Bitkit is set up, but the link to **this creator** is not connected (`none`, `handshake` or `recovery_required`).                                                                                                                          | Yes, first unlock per creator or a link needing recovery | Add the creator if needed and keep Bitkit open. The handoff stays available until the link connects.                                                                                                                                                       |
| "Connecting to this creator. Keep Bitkit open." with a small spinner beside it and the QR/button still available              | The link is in `handshake` and polling is active.                                                                                                                                                                                                     | Yes, while connecting                                    | Wait with Bitkit open. The spinner stops when polling parks or a wallet-setup notice takes precedence.                                                                                                                                                     |
| The QR stays for a long time                                                                                                  | The link has not connected; Bitkit may be closed, offline or using another identity. This is not proof that a scan failed.                                                                                                                            | No                                                       | Open Bitkit with the right identity.                                                                                                                                                                                                                       |
| Spinner with "Check Bitkit for a payment request. Review and confirm it there when it appears."                               | Link connected. This does not acknowledge payment-request delivery.                                                                                                                                                                                   | Yes                                                      | Check Bitkit; approve the request when it appears.                                                                                                                                                                                                         |
| "Finish setting up Bitkit, then keep it open."                                                                                | The Lock Server accepted the request but reports that the reader's wallet is not ready. This notice hides the contact handoff. The server retries until its own invoice deadline (10 minutes in the pinned stack), then the purchase fails.           | Only for an incomplete Bitkit setup                      | Finish the setup in Bitkit. After the failure, **Try again** starts a new purchase.                                                                                                                                                                        |
| "This purchase is still pending. Check Bitkit, then check again here." with **Check again**                                   | Polling parked after three wall-clock minutes. Before an invoice exists, the window counts from the server's invoice deadline; once it exists, the window starts again. Visibility return also restarts it. The purchase remains alive on the server. | Yes, after leaving it alone                              | Check Bitkit, then press Check again.                                                                                                                                                                                                                      |
| "This creator cannot receive payments from you right now. Please contact support."                                            | The Paykit link is `blocked`; the handoff is hidden. A new purchase does not clear this policy state.                                                                                                                                                 | No                                                       | The reader cannot fix it from here.                                                                                                                                                                                                                        |
| "Your connection to this creator needs to be restored. Keep Bitkit open." alongside the QR / **Open in Bitkit**               | The link is `recovery_required`. With wallet setup complete the handoff stays available; no spinner promises automatic recovery.                                                                                                                      | Rare                                                     | Keep Bitkit open and add the creator if needed.                                                                                                                                                                                                            |
| "The payment could not continue. Try again when Bitkit is ready." with **Try again**                                          | The purchase ended `failed`, or submission itself failed (toast "The payment could not be started. Try again later.").                                                                                                                                | Expected after an outage or failed setup                 | After `failed`, Try again checks the wallet, then reuses a saved purchase that can still pay (one another device saved meanwhile) or starts a new one; with no wallet it shows the install screen. After a failed submission it resends the same purchase. |
| "The payment was not completed. You can try again." with **Try again**                                                        | The task is `expired`; the toast uses the same text. It can cover rejection, cancellation or timeout, without guessing which happened.                                                                                                                | Expected after an incomplete payment                     | Try again starts a new purchase with a fresh id, unless another device has since saved one that can still pay. Opening the modal again only shows the ended status.                                                                                        |
| **PAYMENT RECEIVED**, "Opening your content…" and a spinner                                                                   | The payment completed; the app is fetching the credential and content (`finishing`). No Bitkit approval is needed now.                                                                                                                                | Yes, while downloading                                   | Wait.                                                                                                                                                                                                                                                      |
| **PAYMENT RECEIVED**, "Your payment is complete. Check again to open the content."                                            | A paid-content status lookup parked while retrying.                                                                                                                                                                                                   | Rare                                                     | Check again to resume opening the content, without another payment.                                                                                                                                                                                        |
| **PAYMENT RECEIVED**, "Payment received. The content could not be opened — nothing is lost." with **Check again**             | Payment completed but the guarded download failed. Toast "Your payment went through, but the content could not be opened. Nothing is lost — try again."                                                                                               | No                                                       | Check again. Retrying is free; private-copy failures happen later and do not produce this screen.                                                                                                                                                          |
| "This purchase could not be checked. Close the dialog and try again."                                                         | The saved purchase records could not be listed or read, the wallet check failed, or a saved purchase could not be looked up on Lock Server. The app refuses to pay blind. A homeserver 401 is different: see the session row below.                   | No                                                       | Restore access, close and reopen (D-6).                                                                                                                                                                                                                    |
| **PAYMENT RECEIVED**, "Thank you for supporting creators!", **View Content**                                                  | Paid and downloaded.                                                                                                                                                                                                                                  | Yes                                                      | View Content. Closing here also reveals the content.                                                                                                                                                                                                       |
| Dialog "The payment is still running" with **Keep waiting** / **Close anyway**                                                | You closed during submission or the unpaid wait.                                                                                                                                                                                                      | Yes                                                      | Either. Closing only stops this tab's polling; reopening resumes the purchase.                                                                                                                                                                             |
| Dialog "Payment received", "Your payment is complete. You can open this post again to access your content."                   | You closed while paid content was opening.                                                                                                                                                                                                            | Yes                                                      | Keep waiting or Close anyway; reopening resumes access without paying again.                                                                                                                                                                               |
| Toast "Session expired. Please sign in." and the modal closes                                                                 | The reader's homeserver rejected the session (401) at any step (#2839). The modal closes without the "still running" prompt; content that was already downloaded is shown.                                                                            | Only after a session expiry                              | Sign in again. A submitted purchase stays on the server; reopening the modal after sign-in resumes it without paying again.                                                                                                                                |

The footer reads **Close** while waiting, opening paid content or showing the failed-download screen,
and **Cancel** on the other unfinished screens. Submission, waiting and paid-content loading ask for
confirmation on close. The install screen closes without asking. The ready paid screen has
**View Content**; closing it also reveals the content.

## The lock card outside the modal

| Card                                                                                                                                     | Meaning                                                                                                                                              |
| ---------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Title, **Unlock**, price                                                                                                                 | Normal. Pressing Unlock opens the modal, or the sign-in dialog when signed out.                                                                      |
| Title, undimmed pill with a spinner                                                                                                      | The lock file is loading. Unlock is inactive until a readable price is available.                                                                    |
| Title, dimmed pill with `••••••` instead of a price                                                                                      | The lock file could not be read or has no readable price after loading. Unlock does nothing.                                                         |
| Dimmed card above the content, label **My locked content**                                                                               | The creator's own post. Text or attachment skeletons can appear while loading; Unlock is inactive.                                                   |
| Content with the label **Unlocked** and a check mark                                                                                     | This reader unlocked it before. Read from the reader's own copy.                                                                                     |
| Notice "Pubky.app needs your permission to read your Locks data on your homeserver." with **Authorize with Pubky Ring**, Unlock disabled | The session predates Locks and cannot read `/priv` (#2373). The app cannot tell whether this reader already paid, so it does not offer to pay again. |

The loading spinner (#2573), own-lock layout with skeletons (#2757) and IndexedDB cache (#2561)
are merged. Cached lock files and post metadata can appear immediately; attachment bytes still load
from the homeserver. Logout clears this cache.

## Reading again, and the Unlocked tab

The private copy is best-effort: after View Content (or closing the paid modal), the app displays the
downloaded content before copying it into `/priv`. A failed copy does not put the payment dialog on
Check again. The visible content and PAYMENT RECEIVED screen do not prove that the private copy was
saved; a later visit may need to recover the completed purchase again.

A post the reader already unlocked opens with the content at once, no modal, even with the Lock Server
stopped. The reader's own profile has an **Unlocked** tab listing everything unlocked, newest first,
with the sidebar badge showing the count. Each row is the teaser post (author, time, teaser text) with
the unlocked content inside it. An unlocked article is a preview there, like in the feed; the whole
article is on the post page. The tab exists on the reader's own profile only. If the creator deletes the
teaser, the row stays and shows only the content card, with a button that opens an article in place
(#2696).

**Paid while away.** The payment completes on the server whether or not the tab is open. A reader who
closed the tab mid-wait comes back to a post that opens by itself, without pressing anything. The app
lists the reader's purchase records once per page load and finishes any purchase that completed.

## Scenarios

The expected results below were checked against the code. The ids are stable; other documents refer to
them.

### C. Happy path

**C-1. First payment on desktop**

1. Open the creator's teaser and press **Unlock**.
2. The modal opens and submits straight away. When the QR appears, scan it with the reader's Bitkit.
3. Approve the payment request that arrives in Bitkit.

Expected, in order: spinner → "Checking your Bitkit connection…" → the contact QR with the
not-ready or connecting message → the QR disappears and a spinner says "Check Bitkit for a payment
request. Review and confirm it there when it appears." → after approval, **PAYMENT RECEIVED** with
"Opening your content…" → the paid confirmation → **View Content** → the content and attachments.
The checking and download states may be brief; a connecting QR keeps a small spinner beside its message.

**C-2. First payment on mobile (deeplink)**

Open the same post in a mobile browser and press Unlock.

Expected: an **Open in Bitkit** button instead of the QR. It opens Bitkit on the screen that adds the
creator as a contact. From there it is the same as C-1.
Check: the link is `bitkit://contact?pubky=<creator pubky, prefixed form>` and the pubky matches the desktop
QR.

**C-3. A second post from the same creator**

Unlock a different locked post from the same creator.

Expected: when the existing link is connected, no QR or deeplink step. After "Checking your Bitkit
connection…", the modal says "Check Bitkit for a payment request. Review and confirm it there when it
appears."

**C-4. Reading it again**

Open a post you already unlocked.

Expected: the content appears immediately with no payment. It still works with the Lock Server
stopped.

**C-5. The Unlocked list**

1. Open your own profile → the **Unlocked** tab.

Expected: everything you unlocked, newest first; the sidebar badge matches the count. Each row shows
the teaser post with the unlocked content inside it. An unlocked article is a preview; open the post for
the whole article.

2. Look for the tab on someone else's profile.

Expected: not there.

3. As the creator, delete the teaser post; look again as the reader.

Expected: the row is still there, showing only the content card, with no author or time. An article there
has a button that opens it in full (#2696).

**C-6. Close the modal right after paying**

1. Approve in Bitkit and close the modal immediately (**Close anyway** if the prompt appears; once the paid screen is up, closing reveals the content).
2. Go elsewhere in the app and come back to the post.

Expected: closing is not cancelling. If the Lock Server had verified the payment by the time you
return, the content opens on its own. If you return before verification finished, the card still
shows **Unlock**: the app checks for a completed purchase once per page load and does not keep
polling. Press Unlock again, or come back later, and the paid content opens without another payment.
You are not charged twice.

**C-7. Reading an unlocked article**

1. Unlock a locked article (`creator-flow.md`, A-3) and look at it in the feed.
2. Open the teaser post's own page.

Expected: in the feed and in lists, a three-line preview plus the cover. On the post's own page the
whole article, with the cover large above the title. Quoted or embedded inside another post it stays a
preview.

**C-8. The teaser never shows as JSON**

1. Reply to or tag the teaser so the creator gets a notification.
2. As the creator, open the notifications. Switch the feed to the list layout and find the row. Paste the
   link into a messenger and look at the preview.

Expected: none of these shows JSON such as `{"lock_title":...}`. They show the lock title, or "Locked
content" when it is empty (#2662).

### D. Unhappy path

**D-1. Signed out**

While signed out, press Unlock.

Expected: the sign-in dialog. The payment modal does not open.

**D-2. A reader with no Bitkit**

1. As a reader whose Bitkit is not set up, press Unlock.

Expected: the install screen (three steps, Bitkit logo, store badges, **I completed the steps**).
Nothing is submitted and no request reaches any wallet.

2. Press **I completed the steps** without doing anything.

Expected: toast "Bitkit is not set up yet. Finish the steps, then try again." You stay on the screen.

3. Set Bitkit up for real and press it again.

Expected: the payment flow starts (C-1 from the spinner).

Note: with Bitkit set up for a **different** pubky you stay on this screen for good, and the copy does
not say why. Known gap.

**D-3. Mobile deeplink with Bitkit not installed**

On a phone without Bitkit, press **Open in Bitkit**.

Expected: nothing happens, or the OS shows its own message. The app does not break. The store links
on the install screen are the way out.

**D-4. Payment declined, or not enough balance**

Decline the request in Bitkit, or leave the wallet with too small a balance.

Expected: the app waits until Lock Server reports a terminal status, or parks after its polling window
(D-5). An `expired` task shows "The payment was not completed. You can try again." in the modal and
toast; the app does not infer whether it was declined, canceled or timed out. A `failed` task keeps
"The payment could not continue. Try again when Bitkit is ready." Try again starts a **new** purchase unless
another device has since saved one that can still pay; it never resubmits the ended one. Opening the
modal again only shows the ended status.

**D-5. Leaving it alone (the parked state)**

1. Sit on the waiting screen for more than three minutes.

Expected: "This purchase is still pending. Check Bitkit, then check again here." with **Check again**. While
the payment request does not exist yet (the server is still creating it) the three minutes count from
the server's own deadline instead.

2. Approve in Bitkit while parked, then press Check again.

Expected: it moves to the paid screen.

**D-6. A server is down when the modal opens**

1. First open a post as the reader and wait for its price to load. In DevTools Network, identify the
   reader's purchase-record requests for an unpaid lock: the listing of `/priv/social/purchases/<lockId>/`
   and the legacy `/priv/social/purchases/<lockId>.json` (close the modal if you opened it to capture
   them). Block the listing request URL, then press Unlock again. Leave the homeserver and its other
   requests running. Separately, with the Lock Server stopped, open a post whose purchase was already started earlier.

   Do not stop `pubky-testnet` for this test: the local Locks and Paykit ports share its network
   namespace, and restarting it discards homeserver data. Blocking the whole homeserver origin can
   also prevent the lock price or wallet prerequisites from loading.

Expected: "This purchase could not be checked. Close the dialog and try again." Nothing is submitted.

2. With the Lock Server stopped, press Unlock on a post you never started paying for.

Expected: toast "The payment could not be started. Try again later." and the **Try again** screen. The
saved purchase id is kept; Try again resends it.

3. With only Paykit stopped, press Unlock.

Expected: the request is accepted anyway. The Lock Server keeps trying to create the payment request
until its deadline (10 minutes at the time of writing); the modal waits, and when the server gives up a
toast says the payment failed and **Try again** shows.

4. Remove the request block, or restart the individual Lock Server/Paykit service stopped for that
   case, and reopen the modal.

Expected: it proceeds normally.

**D-7. A server dies during the submission**

Stop the Lock Server just as the modal opens and the submission goes out.

Expected: toast "The payment could not be started. Try again later." and the **Try again** screen. This
Try again resends the **same** purchase, unlike D-4. You are not stuck on a spinner.

**D-8. Two tabs at once**

Open the same post in two tabs and press Unlock in both.

Expected: both tabs use the same purchase id. Two submissions may go out, but only one payment
request reaches Bitkit.

**D-9. Reload during the payment**

Reload the browser on the waiting screen and open the post again.

Expected: the purchase in progress is picked up, not started over. No second payment request.

**D-10. A lock with no readable price**

Open a post whose price is missing or whose `lock.json` is broken.

Expected: the masked, dimmed card. The payment modal does not open.

**D-11. Paykit link in an unusual state (if you can produce it)**

Only if you can force the link into `blocked` or `recovery_required`.

Expected: `blocked` replaces the QR with "This creator cannot receive payments from you right now.
Please contact support." With wallet setup complete, `recovery_required` shows "Your connection to
this creator needs to be restored. Keep Bitkit open." and keeps the QR (or **Open in Bitkit**) beside
it. Neither state shows a spinner.

### E. A session from before Locks (#2373)

Setup: an older, still-valid grant whose capabilities lack the Locks `/priv` paths. Legacy cookie
sessions must authorize again first; a fresh Ring grant already includes these paths. A recovery-file
or recovery-phrase login obtains a root grant and does not enter this state. See the
[grant migration guide](../migrations/2600-grant-auth-and-locks.md).

**E-1. The permission notice**

1. Open a locked post.

Expected: "Pubky.app needs your permission to read your Locks data on your homeserver." with
**Authorize with Pubky Ring**, and Unlock disabled.

2. Open your own profile → the Unlocked tab.

Expected: the same notice instead of a spinner or an error. The sidebar badge shows no number.

**E-2. Approving**

1. Choose Authorize with Pubky Ring. The **Enable Locks** dialog shows a QR on desktop; on a phone it
   offers **Continue with Pubky Ring** and **Continue with Bitkit** (#2842); the Bitkit button opens Bitkit
   directly on an iPhone and sends the same `pubkyauth://` link elsewhere. Approve in the app that opens.

Expected: you stay where you are, signed in, no redirect. The notice disappears, Unlock is enabled, the
Unlocked tab shows the list.

2. Close the approval without approving, or approve with a different account.

Expected: closing keeps the old session and the notice. A different account shows an error toast and
changes nothing.

### F-2. The reader unlocks an article with body images (#2655)

1. Unlock the article from `creator-flow.md` F-1 by paying, then open its page.
2. Look at the same card in the feed. Reload, then open the page again.
3. Open your profile → the Unlocked tab, and look at that row.

Expected: on the page, the cover on top and the two body images in their places, in order. The feed
card shows only the cover. After the reload it looks the same (read from the reader's own copy). In
the Unlocked tab the row is a preview; the whole article shows when you open the post.

## Known behaviour — do not report as bugs

1. Bitkit on Android ignored `bitkit://contact?pubky=...` until its deeplink change shipped; on iOS a
   build from 2026-09-23 or later is needed. Check the Bitkit build you test with.
2. When the contact handoff is still needed, a parked phone screen shows both **Open in Bitkit** and
   **Check again**. Of those two controls, only Check again restarts polling.
3. After payment completes, **PAYMENT RECEIVED** and "Opening your content…" show while the content
   downloads. This is a paid state, not another request to confirm in Bitkit (#2640).
4. Bitkit set up with a different pubky than the account keeps the reader on the install screen without
   saying why.
5. An unlocked article card in the feed shows only the cover, but the network tab shows every body
   image downloading (#2686).
