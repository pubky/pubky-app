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

Checked against `dev` on 2026-10-09 (`@synonymdev/locks-sdk` 0.1.0-rc9). Changes that are not merged
yet are marked as such.

## The parts

| Part            | Role for the reader                                                                                                                  |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| **pubky-app**   | The lock card, the Pay to Unlock modal, the Unlocked tab. Holds no keys and no money. It never sees an invoice or an address.        |
| **Lock Server** | Receives the unlock request, has Paykit create the payment request, verifies the payment, and hands out the content once it is paid. |
| **Paykit**      | Delivers the payment request to the reader's Bitkit over a private link between reader and creator.                                  |
| **Bitkit**      | The reader's wallet. Receives the payment request and pays it.                                                                       |
| **Pubky Ring**  | Only for signing in, and once for old sessions (#2373). Never part of a payment.                                                     |

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
- A purchase in progress is remembered as a small file in the same area. It is the only handle to a
  payment, so the app writes it before it submits anything, and refuses to pay when it cannot read it.

## The happy path (first unlock from a creator, desktop)

| #   | You do                                                                       | You see                                                                                                                                                        | What is happening                                                                                                                                                    |
| --- | ---------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Open the teaser.                                                             | The teaser text, then the lock card: title, **Unlock**, the price in sats.                                                                                     | The app fetched the public `lock.json` for the price.                                                                                                                |
| 2   | Press **Unlock**.                                                            | The button slides over the price. The **Pay to Unlock** modal opens with the title, the creator's avatar, **COST TO UNLOCK** and a spinner. No confirm button. | The app reads the reader's purchase record, checks that Bitkit (Paykit) is set up for this pubky, then mints a purchase id, saves it and submits the unlock request. |
| 3   | A QR appears with "Scan with Bitkit and pay to unlock." Scan it with Bitkit. | The QR encodes the **creator's** pubky. It stays while the reader's Bitkit has no link to this creator yet.                                                    | The request is accepted. Paykit opens a private link to the reader's wallet; the wallet still needs the creator's pubky to answer, which the scan gives it.          |
| 4   | Bitkit shows the creator as a contact and the payment request arrives.       | In the app the QR disappears. A spinner with "Please confirm in Bitkit." (desktop prefixes "Awaiting payment."; a phone shows an **AWAITING PAYMENT** label).  | The link is connected and the payment request was delivered. The app polls the Lock Server every 3 seconds.                                                          |
| 5   | Approve the payment in Bitkit.                                               | **PAYMENT RECEIVED**, "Thank you for supporting creators!" (desktop prefixes "Unlocked."), a check mark, **View Content**.                                     | The Lock Server verified the payment, the app downloaded the content and copied it into the reader's `/priv`.                                                        |
| 6   | Press **View Content**.                                                      | The content in place of the lock card, with the label **Unlocked**.                                                                                            |                                                                                                                                                                      |

On a phone step 3 shows a **Pay with Bitkit** button instead of the QR. It opens
`bitkit://contact?pubky=<creator pubky, prefixed form>`, the same screen a scan reaches.

The second unlock from the same creator skips step 3: the link exists, so the modal goes straight to
"Please confirm in Bitkit."

## Screens you may meet in the modal

The modal has no confirm step. Everything after opening it is automatic until the payment request is
in Bitkit.

| Screen                                                                                                         | Meaning                                                                                                                                                                                               | Normal?                               | What to do                                                                                                                                                                                                                                 |
| -------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Spinner, no buttons but Cancel                                                                                 | Reading the saved purchase record, checking the wallet, then submitting. Closing after the submission started asks for confirmation.                                                                  | Yes, for a moment                     | Wait.                                                                                                                                                                                                                                      |
| Three steps "Install Bitkit / Set up profile / Fund wallet", store badges, **I completed the steps**           | The reader's homeserver has no Paykit data: Bitkit is not set up for **this** pubky. Nothing was submitted and no request reaches any wallet.                                                         | Yes, for a reader without Bitkit      | Set Bitkit up with the same recovery phrase, then press the button. Closing here asks nothing.                                                                                                                                             |
| Toast "Bitkit is not set up yet. Finish the steps, then try again." after that button                          | The check ran again and still found no Paykit data.                                                                                                                                                   | Yes                                   | Finish the Bitkit setup. If Bitkit uses a different pubky, this never clears (known gap).                                                                                                                                                  |
| QR with "Scan with Bitkit and pay to unlock." (desktop) or **Pay with Bitkit** (phone)                         | Submitted. Bitkit is set up, but the Paykit link between this reader and **this creator** is not connected yet (`none` or `handshake`).                                                               | Yes, first unlock per creator         | Scan or tap. The QR stays until Bitkit answers.                                                                                                                                                                                            |
| The QR stays for a long time                                                                                   | The reader's Bitkit has not answered the handshake: it is closed, offline, or holds another identity.                                                                                                 | No                                    | Open Bitkit with the right identity. Nothing is charged while waiting.                                                                                                                                                                     |
| Spinner with "Please confirm in Bitkit." (desktop adds "Awaiting payment."; a phone adds **AWAITING PAYMENT**) | Link connected, payment request delivered to the wallet.                                                                                                                                              | Yes                                   | Approve in Bitkit.                                                                                                                                                                                                                         |
| "Finish setting up Bitkit. The payment request arrives once your wallet is ready."                             | The Lock Server accepted the request but reports that the reader's wallet is not ready to receive it. It retries until its own deadline (10 minutes at the time of writing), then the purchase fails. | Only for an incomplete Bitkit setup   | Finish the setup in Bitkit. After the failure, **Try again** starts a new purchase.                                                                                                                                                        |
| "Still waiting for the payment. Pay in Bitkit, then check again." with **Check again**                         | Parked: three minutes since the wait started (or since the tab last became visible), whatever happened in between. The purchase is still alive on the server; only this tab stopped polling.          | Yes, after leaving it alone           | Pay in Bitkit, then press Check again.                                                                                                                                                                                                     |
| "This creator cannot receive payments from you right now. Please contact support."                             | The Paykit link is `blocked`, a policy state. A new purchase does not clear it.                                                                                                                       | No                                    | The reader cannot fix it from here.                                                                                                                                                                                                        |
| "Your Bitkit connection to this creator is being restored. Keep Bitkit open while we reconnect."               | The Paykit link is `recovery_required`.                                                                                                                                                               | Rare                                  | Keep Bitkit open and wait.                                                                                                                                                                                                                 |
| "The payment could not continue. Try again when Bitkit is ready." with **Try again**                           | The purchase ended `failed` or `expired` (a toast said which), or the submission itself failed (toast "The payment could not be started. Try again later.").                                          | Expected after a decline or an outage | Try again. After `failed`/`expired` it starts a **new** purchase (after `failed` it checks the wallet first and shows the install screen when there is none); after a failed submission it resends the same one. Nothing is charged twice. |
| "Payment received. The content could not be opened — nothing is lost." with **Check again**                    | The payment completed but the download or the copy into `/priv` failed. Toast "Your payment went through, but the content could not be opened. Nothing is lost — try again."                          | No                                    | Check again. Retrying is free; the entitlement is permanent.                                                                                                                                                                               |
| "This purchase could not be checked. Close the dialog and try again."                                          | The saved purchase record could not be read from the homeserver, or a saved purchase could not be looked up on the Lock Server. Paying blind could charge twice, so the app refuses.                  | No                                    | Bring the server back, close, reopen.                                                                                                                                                                                                      |
| **PAYMENT RECEIVED**, "Thank you for supporting creators!", **View Content**                                   | Paid and downloaded.                                                                                                                                                                                  | Yes                                   | View Content. Closing the modal here also reveals the content.                                                                                                                                                                             |
| Dialog "The payment is still running" with **Keep waiting** / **Close anyway**                                 | You closed the modal during the submission or the wait.                                                                                                                                               | Yes                                   | Either. Closing only stops this tab's polling; the payment continues and reopening resumes it.                                                                                                                                             |

The footer button reads **Close** on the waiting and "could not be opened" screens and **Cancel** on the
others. Closing during the wait, or while a submission is in flight, asks for confirmation. The install
screen closes without asking, and closing the paid screen reveals the content.

## The lock card outside the modal

| Card                                                                                                                                     | Meaning                                                                                                                                              |
| ---------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Title, **Unlock**, price                                                                                                                 | Normal. Pressing Unlock opens the modal, or the sign-in dialog when signed out.                                                                      |
| Title, dimmed pill with `••••••` instead of a price                                                                                      | The lock file is still loading, could not be read, or has no readable price. Unlock does nothing.                                                    |
| Dimmed card above the content, label **My locked content**                                                                               | The creator's own post. No payment involved.                                                                                                         |
| Content with the label **Unlocked** and a check mark                                                                                     | This reader unlocked it before. Read from the reader's own copy.                                                                                     |
| Notice "Pubky.app needs your permission to read your Locks data on your homeserver." with **Authorize with Pubky Ring**, Unlock disabled | The session predates Locks and cannot read `/priv` (#2373). The app cannot tell whether this reader already paid, so it does not offer to pay again. |

Not merged yet: #2573 (PR #2772) replaces the masked dimmed pill with a spinner while the lock file
loads, and stops it on failure.

## Reading again, and the Unlocked tab

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

Expected, in order: spinner → QR → the QR disappears and a spinner says "Please confirm in Bitkit." →
after approval the paid screen → **View Content** → the content and its attachments.

**C-2. First payment on mobile (deeplink)**

Open the same post in a mobile browser and press Unlock.

Expected: a **Pay with Bitkit** button instead of the QR. It opens Bitkit on the screen that adds the
creator as a contact. From there it is the same as C-1.
Check: the link is `bitkit://contact?pubky=<creator pubky, prefixed form>` and the pubky matches the desktop
QR.

**C-3. A second post from the same creator**

Unlock a different locked post from the same creator.

Expected: no QR or deeplink step. The modal goes straight to "Please confirm in Bitkit."

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

Expected: closing is not cancelling. When you return, the content opens on its own. You are not charged
twice.

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

On a phone without Bitkit, press **Pay with Bitkit**.

Expected: nothing happens, or the OS shows its own message. The app does not break. The store links
on the install screen are the way out.

**D-4. Payment declined, or not enough balance**

Decline the request in Bitkit, or leave the wallet with too small a balance.

Expected: the app keeps waiting; after three minutes it parks (D-5). Whether and when the purchase ends
is the Lock Server's call: when it marks it `expired` or `failed`, a toast says so ("The payment expired.
You can try again.") and the **Try again** screen shows. Try again starts a **new** purchase; the old one is never retried. You are
not charged twice.

**D-5. Leaving it alone (the parked state)**

1. Sit on the waiting screen for more than three minutes.

Expected: "Still waiting for the payment. Pay in Bitkit, then check again." with **Check again**. While
the payment request does not exist yet (the server is still creating it) the three minutes count from
the server's own deadline instead.

2. Approve in Bitkit while parked, then press Check again.

Expected: it moves to the paid screen.

**D-6. A server is down when the modal opens**

1. With the homeserver stopped, press Unlock. Also: with the Lock Server stopped, open a post whose
   purchase was already started earlier.

Expected: "This purchase could not be checked. Close the dialog and try again." Nothing is submitted.

2. With the Lock Server stopped, press Unlock on a post you never started paying for.

Expected: toast "The payment could not be started. Try again later." and the **Try again** screen. The
saved purchase id is kept; Try again resends it.

3. With only Paykit stopped, press Unlock.

Expected: the request is accepted anyway. The Lock Server keeps trying to create the payment request
until its deadline (10 minutes at the time of writing); the modal waits, and when the server gives up a
toast says the payment failed and **Try again** shows.

4. Bring the server back and reopen the modal.

Expected: it proceeds normally.

**D-7. A server dies during the submission**

Stop the Lock Server just as the modal opens and the submission goes out.

Expected: toast "The payment could not be started. Try again later." and the **Try again** screen. This
Try again resends the **same** purchase, unlike D-4. You are not stuck on a spinner.

**D-8. Two tabs at once**

Open the same post in two tabs and press Unlock in both.

Expected: only one request goes out. Two payment requests must not arrive in Bitkit.

**D-9. Reload during the payment**

Reload the browser on the waiting screen and open the post again.

Expected: the purchase in progress is picked up, not started over. No second payment request.

**D-10. A lock with no readable price**

Open a post whose price is missing or whose `lock.json` is broken.

Expected: the masked, dimmed card. The payment modal does not open.

**D-11. Paykit link in an unusual state (if you can produce it)**

Only if you can force the link into `blocked` or `recovery_required`.

Expected: a notice replaces the QR — "This creator cannot receive payments from you right now." or
"Your Bitkit connection to this creator is being restored." It does not sit on a spinner.

### E. A session from before Locks (#2373)

Setup: an account that signed in with Pubky Ring before this build. An account that signed in with a
recovery file or key has every permission and never gets into this state.

**E-1. The permission notice**

1. Open a locked post.

Expected: "Pubky.app needs your permission to read your Locks data on your homeserver." with
**Authorize with Pubky Ring**, and Unlock disabled.

2. Open your own profile → the Unlocked tab.

Expected: the same notice instead of a spinner or an error. The sidebar badge shows no number.

**E-2. Approving**

1. Choose Authorize with Pubky Ring and approve.

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
2. On the parked screen a phone shows both **Pay with Bitkit** and **Check again**. Only Check again
   restarts the polling.
3. For a few seconds after the payment completes, while the content downloads, the modal still says
   "Please confirm in Bitkit." (#2640).
4. Bitkit set up with a different pubky than the account keeps the reader on the install screen without
   saying why.
5. An unlocked article card in the feed shows only the cover, but the network tab shows every body
   image downloading (#2686).
