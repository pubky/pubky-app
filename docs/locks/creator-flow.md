# Locks: creator flow

How a creator publishes locked content in pubky-app, screen by screen, and what each screen means.
Written for someone who runs the app and needs to know whether what they see is normal. The reader
side is in [`reader-flow.md`](reader-flow.md).

Companions:

- [`../locks.md`](../locks.md) — how it works inside the app.
- [`locks-local-stack/README.md`](locks-local-stack/README.md) — running the Lock Server, Paykit and a
  testnet locally.
- `pubky/flow-inspectorate` → `docs/manual-e2e-locks-ring-bitkit.md` — what to do inside Pubky Ring and
  Bitkit at each step. That document refers to the scenario ids used here (A-1, B-1, ...).

Checked against `dev` at `8f802fa01` on 2026-10-28
(`@synonymdev/locks-sdk` `0.1.0`).

## The parts

| Part            | Role for the creator                                                                                                                                        |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **pubky-app**   | The composer, the setup dialog, the price dialog. Holds no keys and no money.                                                                               |
| **Lock Server** | Stores the lock and verifies payments. The creator authorizes a browser session, separate from the app sign-in.                                             |
| **Pubky Ring**  | Approves the Lock Server authorization, and the extra homeserver permission for old sessions (#2373). Bitkit can approve either one instead (#2842, #2860). |
| **Bitkit**      | The payout wallet. Connected once through the Paykit setup page inside the dialog.                                                                          |

The pubky.app account, the Ring identity and the Bitkit wallet must be the **same key**. Until #2283
lands, the app rejects a Lock Server authorization from another account (#2758).

## Before you start

1. A creator account with Pubky Ring holding the same identity, and a Bitkit wallet restored from the
   same recovery phrase. The Bitkit side is described in the flow-inspectorate document (S-1 to S-3).
2. A desktop browser (1024px or wider) and a phone. On desktop the dialog shows QR codes; on a touch
   device it shows buttons that open Ring or Bitkit directly.
3. Test images for sections F and G: 10 small PNGs, one PNG over 10,000,000 bytes, one SVG. The
   commands below.
4. On the local stack there is no Bitkit. The runbook does the Ring and Bitkit steps from the terminal
   (sections 9 and 10).

   ```bash
   mkdir -p ~/Desktop/locks-test-img && cd ~/Desktop/locks-test-img
   for i in $(seq 1 10); do magick -size 400x300 "xc:hsl($((i*36)),80%,50%)" small-$i.png; done
   magick -size 1900x1900 xc: +noise Random -depth 8 big.png   # about 10.8 MB
   echo '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><circle cx="50" cy="50" r="40" fill="orange"/></svg>' > drawing.svg
   ```

5. Paid unlocks can be held by region (#2904): see B-8. The local stack sets no region list.

## What survives a page reload

|                           | Where it is kept                                                                                                                                           | After a reload                                                                                                                                   |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Lock Server authorization | The secret from the Ring or Bitkit approval and the account it was issued to, in localStorage (`locks-auth-store`); the session is rebuilt on load (#2857) | **Kept.** No approval is asked again.                                                                                                            |
| Bitkit payout connection  | On the Lock Server. The app asks it on the first dialog open after a page load (#2716).                                                                    | **Kept.** The dialog shows "Checking whether your Bitkit wallet is connected." briefly, then **Locks Enabled**; Continue opens the price dialog. |
| The draft and the price   | Memory only                                                                                                                                                | Gone.                                                                                                                                            |

## The happy path

The scenarios below use **Bitcoin** in **Price currency**, with the amount in whole sats. The selector
also offers **USD**: enter a positive dollar amount with up to two decimal places. Changing currency
clears the amount. The approximate dollar value next to a Bitcoin amount is only a display estimate;
a USD-priced lock keeps its dollar price and is quoted for payment by the server.

| #   | You do                                                                                                                                                                                 | You see                                                                                                                                                                                                                                                                                                  | What is happening                                                                                                                                                                                                                                          |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Write the **content you want to lock** (text plus an image, or an article). Turn the **Lock content** switch on.                                                                       | The switch only works when the draft has text or at least one attachment. Once the lock is applied the article button is gone. While the switch is off, an info icon beside it opens **Sell your content**: "Let people pay to unlock the value you create. Add content first, then switch on the lock." | The draft is captured as the content to lock. It stays visible behind every dialog that follows.                                                                                                                                                           |
| 2   | First time only: the dialog opens on **Lock Content** ("Pubky Locks allows you to lock content with payments.")                                                                        | **Continue** shows a spinner for a moment, then becomes clickable.                                                                                                                                                                                                                                       | The app checks that the Lock Server answers.                                                                                                                                                                                                               |
| 3   | Press **Continue**. **Enable Locks** shows the Lock Server's page: a QR (desktop) or its app buttons (phone). Approve in Pubky Ring or Bitkit, with the same pubky you signed in with. | The dialog moves on by itself.                                                                                                                                                                                                                                                                           | The approval creates a Lock Server session for this account. The secret goes to localStorage.                                                                                                                                                              |
| 4   | Old sessions only (#2373): **Enable Locks (2/2)**. Approve in Ring again.                                                                                                              | The two steps are numbered (1/2) and (2/2) only when both were pending when the dialog opened.                                                                                                                                                                                                           | The homeserver session is replaced by one that may read the `/priv` area. Nothing else changes; you stay signed in.                                                                                                                                        |
| 5   | **Enable Payments**: "Checking whether your Bitkit wallet is connected." then Paykit's setup page: a QR (desktop) or a button that opens Bitkit (phone). Approve in Bitkit.            | If the payout account was connected before, this step is skipped after the check.                                                                                                                                                                                                                        | The Lock Server is asked whether this creator's Paykit setup is done. If not, Paykit's setup page binds the Bitkit wallet as the payout account.                                                                                                           |
| 6   | **Locks Enabled** ("You authorized the Locks server to manage your Locks data."). Press **Continue**.                                                                                  |                                                                                                                                                                                                                                                                                                          |                                                                                                                                                                                                                                                            |
| 7   | **Lock Content**: enter a **Bitcoin Amount** in sats. Press **Apply Lock**.                                                                                                            | The USD value appears next to the amount. Apply Lock stays disabled for an empty value or `0`. Typing `-5` gives `5`; typing `1.5` gives `15`; pasting `1.5` gives `1` (B-4).                                                                                                                            | Only the price is recorded. Nothing is uploaded yet.                                                                                                                                                                                                       |
| 8   | The composer is now empty and the cursor is in the teaser field. Write the **teaser** and the lock title (the field inside the lock card, default "Locked content"). Press **Post**.   | The lock card previews inside the composer. A pencil after the title starts editing it; clicking the title does the same, and Enter ends it. The price is a button: it reopens **Lock Content** with the applied price filled in, and **Apply Lock** changes the price and keeps the teaser.             | Publishing uploads the locked post and its files (up to three at a time) to the creator's `/priv/app.locks/content/`, registers the lock with a 24-hour payment window (`payment_in`, #2853), then posts the teaser with a link to the public `lock.json`. |
| 9   | Look at the timeline.                                                                                                                                                                  | The teaser is there at once, with the lock card: title, **Unlock**, price. Readers do not see the locked content; the creator sees it under **My locked content** once it loads.                                                                                                                         |                                                                                                                                                                                                                                                            |

The Bitkit payout connection (step 5) is stored server-side for the account. The Lock Server
authorization (step 3) lasts while this browser retains a valid Lock Server secret. Another browser,
logout, cleared storage or an expired secret can require approval again. With a valid stored secret, a
page reload keeps it: the dialog shows the Bitkit check, then **Locks Enabled**, and Continue
leads to the price dialog. Within one page session, after setup completes, the switch opens the price
dialog directly.

## Screens you may meet in the setup dialog

| Screen                                                                                              | Meaning                                                                                                                                                                              | Normal?                                                                     | What to do                                                                                                                                                                                                                                                                  |
| --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Lock Content** with Continue showing a spinner                                                    | The app is checking that the Lock Server answers.                                                                                                                                    | Yes, for a moment                                                           | Wait.                                                                                                                                                                                                                                                                       |
| "The Lock Server is unavailable right now. Please try again later." and Continue disabled           | The Lock Server did not answer.                                                                                                                                                      | No                                                                          | Check the Lock Server. The composer and the draft are untouched.                                                                                                                                                                                                            |
| **Enable Locks** with a QR or app buttons                                                           | No Lock Server session for this account yet.                                                                                                                                         | Yes, first time                                                             | Approve in Pubky Ring or Bitkit with the account you are signed in with.                                                                                                                                                                                                    |
| **Enable Locks** again after a reload                                                               | The Lock Server rejected the stored secret when the page loaded, and the app cleared it. A secret saved before #2857 has no account stored with it and is cleared once the same way. | Yes, if the secret was invalidated, or once after updating past #2857       | Approve again. With a valid secret this is a bug.                                                                                                                                                                                                                           |
| "Something went wrong while authorizing the Lock Server." with **Try again**                        | The approval was denied or closed, or the exchange failed.                                                                                                                           | Expected after a deny                                                       | Try again and approve.                                                                                                                                                                                                                                                      |
| The same, with "Approve with the account you are signed in with."                                   | The approval used a different identity than the pubky.app account (#2758).                                                                                                           | Expected for a wrong identity                                               | Approve with the right identity.                                                                                                                                                                                                                                            |
| **Enable Locks (1/2)** then **(2/2)**                                                               | The session predates Locks and lacks the `/priv` permission (#2373).                                                                                                                 | Yes, once per old session                                                   | Approve both. Nothing is signed out.                                                                                                                                                                                                                                        |
| **Enable Payments** with "Checking whether your Bitkit wallet is connected."                        | The Lock Server is being asked whether the payout account exists (first dialog open after a page load).                                                                              | Yes, for a moment                                                           | Wait. If the account exists the step is skipped.                                                                                                                                                                                                                            |
| **Enable Payments** with a QR or a Bitkit button                                                    | No payout account yet.                                                                                                                                                               | Yes, first time                                                             | Approve in Bitkit.                                                                                                                                                                                                                                                          |
| "Something went wrong while checking your Bitkit wallet." and "Payments are unavailable right now." | The payout-status check failed; either the Lock Server or Paykit may be unavailable.                                                                                                 | No                                                                          | Check the Lock Server first, then Paykit. Try again repeats the check.                                                                                                                                                                                                      |
| "Something went wrong while connecting your Bitkit wallet."                                         | The Paykit setup page failed or was denied.                                                                                                                                          | Expected after a deny                                                       | Try again. It runs the check first and reopens the setup only if needed.                                                                                                                                                                                                    |
| **Locks Enabled**                                                                                   | Everything is set up.                                                                                                                                                                | Yes                                                                         | Continue to the price.                                                                                                                                                                                                                                                      |
| The price dialog opens directly, no setup dialog                                                    | Lock Server session and payout account were both confirmed in this page session.                                                                                                     | Yes, within one page session                                                |                                                                                                                                                                                                                                                                             |
| The setup dialog opens while you press **Post**                                                     | The Lock Server rejected the stored secret during publishing (401), or reported that the payout account is no longer set up (`setup_required`).                                      | Expected after the secret was invalidated or the payout account was removed | On the **Lock Content** intro: press Continue, approve again, wait for the Bitkit check, then Continue on **Locks Enabled** before **Post**. On **Enable Payments**: approve in Bitkit, then Continue on **Locks Enabled** before **Post**. Cancel abandons the lock (B-7). |
| Toast "Something went wrong. Try again." on **Post**                                                | Publishing failed for another reason (network, server error).                                                                                                                        | No                                                                          | Press Post again. Nothing was published.                                                                                                                                                                                                                                    |

The composer never breaks or goes blank in any of these cases. If it does, that is a bug.

## Reading your own post

Open the teaser you published. The content shows without any payment: the app reads the original from
the creator's own `/priv` area. Above the content the lock card stays visible, dimmed, so the price is
still readable, and the label reads **My locked content**. This applies in the feed as well as on the post
page.

Two conditions must both hold: the lock creator and the post author are the signed-in account. A post
that points at someone else's lock is not "own".

While `lock.json` loads, the pill shows a spinner and Unlock is inactive (#2573). As soon as the lock
file identifies your own post, the dimmed card and **My locked content** appear with a text skeleton
until the original is read (#2757). Unlock stays inactive on your own post. If the post metadata is
already cached, the text appears first and each attachment has a skeleton until its bytes arrive.
Without cached metadata, the original post and attachment bytes are fetched together.

The lock file and readable post metadata are cached in IndexedDB (#2561); attachment bytes are fetched
from the homeserver. A later visit can use the cached metadata immediately. Logout clears the cache.

## Editing the teaser

Open the edit dialog on the teaser. You can change the teaser text and lock title, and add or remove
public teaser attachments. The price is read-only, taken from the existing `lock.json`. After saving,
the locked content and the price are unchanged and the post still renders as a lock card.

## Scenarios

The expected results below were checked against the code. The ids are stable; other documents refer to
them.

### A. Happy path

**A-1. Turn Locks on and connect the payout account (first time only)**

1. Type anything into the composer and turn the **Lock content** switch on.
2. Press **Continue** on the Lock Content card. Approve the Lock Server in Pubky Ring or Bitkit (QR on
   desktop, the Lock Server's app buttons on a phone).
3. The dialog moves to **Enable Payments** on its own. Approve in the creator's Bitkit.

Expected: **Locks Enabled**; press **Continue** to open the price dialog. The draft stays visible behind the dialogs the whole
time.

**A-2. Publish a locked post**

1. Write the content to lock (text plus one image works well). Turn the switch on. With Locks already
   set up you land on the price dialog directly.
2. Enter a Bitcoin Amount and press **Apply Lock**.
3. The composer clears. Write the teaser and the lock title, then publish.

Expected: the teaser appears in the timeline immediately with the lock title and the price. Readers do
not see the locked content; the creator sees it under **My locked content** once it loads (A-4).

**A-3. An article as the locked content**

Repeat A-2 with an article (title plus body) as the content to lock.

Expected: it publishes. A reader who unlocks it sees it rendered as an article. The teaser itself cannot
be an article (B-2). Articles with images in the body are covered in section F.

**A-4. Read your own post**

Open the teaser you published.

Expected: the locked content is visible without payment, with the dimmed lock card above it and the
label **My locked content**. See "Reading your own post" for the loading and cache behavior.

**A-5. Edit the teaser**

Open the edit dialog for the teaser.

Expected: the teaser text, lock title and public teaser attachments can be changed; the price is
read-only. After saving, the locked content and the price are unchanged and the post still renders as
a lock card.

### B. Unhappy path

**B-1. Publish again after a reload (important)**

1. Finish A-1, then reload the page.
2. Turn the switch on again.

Expected: no approval on **Enable Locks**. The dialog shows "Checking whether your Bitkit wallet is connected." for a
moment, then **Locks Enabled**; Continue opens the price dialog. No Bitkit QR (#2716).
Treat as a failure: being asked to approve on **Enable Locks** again, or being shown the Bitkit QR when the payout
account was already connected.

**B-2. An article or a collection cannot be the teaser**

Turn the switch on, set a price and press Apply Lock.

Expected: the composer is in teaser mode and the article button is gone.

**B-3. The switch on an empty composer**

Try to turn the switch on with nothing written and nothing attached.

Expected: the switch is disabled and does not turn on. An empty draft must never become locked content.
A draft with only an attachment can be locked.

**B-4. An invalid price**

Select **Bitcoin** in **Price currency**, then clear the price field before each case: leave it empty, enter `0`, type `-5`, type `1.5`, then paste `1.5`.

Expected: **Apply Lock** stays disabled for an empty value and `0` (only a positive whole number of sats
is accepted), and the cursor shows the not-allowed state. A minus sign or dot is dropped on its own
keystroke: typing `-5` gives `5`, and typing `1.5` gives `15`, both with Apply Lock enabled. Pasting
`1.5` stops at the dot, giving `1` with Apply Lock enabled for 1 sat. If the exchange rate cannot be
loaded the dialog says so, and the price in sats still works.

**B-5. Cancel partway through the setup**

1. Turn the switch on and cancel the setup dialog.
2. Turn it on again, get to the price dialog, and close it.
3. Apply a price, write a teaser, then press the price in the lock card and close the dialog.

Expected: after 1 and 2 you return to writing a normal post with your draft intact. Nothing is left
half-locked. After 3 the lock stays, with its applied price and your teaser.

**B-6. The Lock Server is down**

In a browser without a stored Lock Server secret, stop the Lock Server and turn the switch on.

Expected: "The Lock Server is unavailable right now. Please try again later." with Continue disabled.
The composer does not break or go blank.

With a stored secret (after A-1 and a reload), an unreachable server does not invalidate the restored
session. The dialog opens on **Enable Payments** and shows "Something went wrong while checking your
Bitkit wallet." with "Payments are unavailable right now. Please try again later." and **Try again**.
Within one page session after a completed setup, the switch opens the price dialog directly; pressing
**Post** then shows the failure toast "Something went wrong. Try again."

**B-7. The Lock Server rejects the session during publishing**

This is about the Lock Server secret from the approval in A-1, not the Bitkit connection and not
the pubky.app sign-in. The app has no expiry timer for it. On page load the app rebuilds the session from
the stored secret and checks it with one server call; a secret the server rejects is cleared right there,
and the next switch-on simply asks for **Enable Locks** again (that is not this scenario). This scenario
needs a secret that becomes invalid **after** the page loaded: then the first call that fails is the
publish, and only a 401 there triggers the flow below. Waiting will not reproduce it.

How to reproduce: with the page open and Locks set up, invalidate the creator's session on the Lock
Server (for example by deleting it from its database). Do not reload.

Steps:

1. Turn the switch on and set a price.
2. Write the teaser and publish.

Expected: the setup dialog reopens on the **Lock Content** intro; Continue leads to **Enable Locks**.
After you approve again, the dialog checks the Bitkit connection ("Checking whether your Bitkit
wallet is connected.") and shows **Locks Enabled**. Press **Continue** to close it: the draft and price
are preserved, and pressing **Post** again publishes the lock.

The same dialog also reopens when the publish-time payout check answers `setup_required` (the payout
account was removed on Paykit). Then it opens on **Enable Payments** instead of the intro: after the
Bitkit check, approve in Bitkit, then Continue on **Locks Enabled** and press **Post** again.

**Cancel** on Locks Enabled abandons the lock: the original locked content returns to the composer,
and the price and teaser are discarded. Nothing is published automatically. A later **Post** can
publish that restored draft as an ordinary, unlocked post.

**B-8. Paid unlocks held in the creator's region (#2904)**

Only on a deployment that sets `PUBKY_RUNTIME_REGION_MODES` (PR previews set
`EU=blocked,GB=blocked,US=blocked`), from a listed region.

1. Write something and look at the **Lock content** switch.

Expected: the switch is disabled, with an info icon beside it and no sentence. The icon opens "Paid
unlocks aren't available in your region yet." and "Free posts, content you already unlocked and
everything else in Pubky work as usual." The **Sell your content** icon is not shown. Normal posts
publish as usual. While the region is still being read, the switch is disabled with no icon. If the
region cannot be read and unknown viewers are held, the notice reads "We can't tell where you are, so
paid unlocks are paused."

### E-3. A session from before Locks (#2373)

Setup: an older, still-valid grant whose capabilities lack the Locks `/priv` paths. Legacy cookie
sessions must authorize again first; a fresh Ring grant already includes these paths. A recovery-file
or recovery-phrase login obtains a root grant and does not enter this state. See the
[grant migration guide](../migrations/2600-grant-auth-and-locks.md).

1. Turn the switch on.

Expected: **Enable Locks (1/2)** (the Lock Server) and **Enable Locks (2/2)** (the permission). Both must
finish before the price dialog. If you finish only step 1, close and reopen, the remaining step shows as
**Enable Locks** without a number. A new session shows a single unnumbered step. On a phone the
permission step offers **Continue with Pubky Ring** and **Continue with Bitkit** (#2842). On Android
(not Firefox) each button opens its own app directly (#2885).

2. Before step 1, or with another session from before Locks, open your own locked post.

Expected: the permission notice ("Pubky.app needs your permission to read your Locks data on your
homeserver.") instead of the content. After approving, the content shows.

### F. Locked articles with images in the body (#2655)

An article keeps each inserted image in the browser; nothing is uploaded while you write. When the
switch goes on, the images become `attachment:n` placeholders in the body and the files go into the lock
together with the cover. A locked article's images never reach public storage.

Lines marked **(developer check)** need direct access to the homeserver or Nexus.

**F-1. The main flow**

1. A new article: title, cover (`small-1`), two images (`small-2`, `small-3`) between paragraphs.
2. Switch on → price → Apply → teaser and lock title → Post.
3. Open the teaser.

Expected: the cover on top and the two images between the same paragraphs, in the same order and place.
The feed card shows only the cover.
(developer check) The teaser is a short post with no attachments. The creator's
`/priv/app.locks/content/` holds the body and the three images. No image from this article was written
to the creator's public storage, before or after publishing.

**F-2. The reader unlocks** — see `reader-flow.md`, F-2.

**F-3. Many images**

A locked article with a cover and eight body images (`small-2` to `small-9`); unlock as the reader.

Expected: all nine images, in the order they were written.

**F-4. No cover**

A locked article with two body images and no cover; unlock as the reader.

Expected: the first body image stays in its place. It does not move up as a cover.

**F-5. Cancel before Apply**

An article with images → switch on → close the price dialog without Apply.

Expected: the switch is off, the editor is unchanged, the image previews work.

**F-6. Cancel after Apply, then publish normally**

1. An article with a cover and two body images → switch on → price → Apply.
2. Turn the switch off → the article comes back into the editor → publish normally.

Expected: the title, body, cover and images come back, with no "Articles support one cover image"
toast. It publishes as a normal article with the cover and working images, and no error toast. Repeat
once without a cover.

**F-7. Markdown mode**

1. A new article → markdown mode → insert one image with the toolbar button.
2. Type one sentence and immediately turn the switch on → price → Apply → switch off.

Expected: the sentence and the image are still there.

**F-8. Empty title or body**

Title and cover only; then body only.

Expected: the switch is disabled in both cases.

**F-9. Leaving without publishing**

Insert images into an article, with or without the switch, and move to another page inside the app.

Expected: nothing unusual.
(developer check) Nothing was uploaded, so nothing is left in public storage, also after a reload or
a closed tab.

**F-10. Normal articles still work**

1. Without a lock, publish an article with a title, a cover and two body images.
2. Insert two body images, remove one, publish.

Expected: publishing works as before and the images show in place.
(developer check) In step 2 the removed image is never uploaded; only the image left in the body is.

### G. File limits for locked content (#2655)

The Lock Server takes up to 10 files per lock (the locked post is one of them) and up to 10,000,000
bytes per file. It refuses only after the upload, which would leave orphans, so the app checks when the
switch goes on: over the limit → a toast and the switch stays off. Someone who is not locking anything
never sees these messages.

| #   | Steps                                                                                       | Expected                                                                                                |
| --- | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| G-1 | Article: cover + 9 body images → switch on                                                  | Toast "Locked content supports up to 9 files of 9.5MB each.", switch off, no dialog (the cover counts)  |
| G-2 | In G-1, remove one body image, wait half a second, switch on again                          | Continues normally (1 cover + 8 body images = 9)                                                        |
| G-3 | Insert `big.png` into an article body (the insert works) → switch on                        | The G-1 toast, switch off                                                                               |
| G-4 | `drawing.svg` in an article body → switch on. Also once with `drawing.svg` as the cover     | Toast "Locked content cannot include SVG images yet.", switch off                                       |
| G-5 | A normal post with 10 images attached → switch on                                           | The G-1 toast                                                                                           |
| G-6 | A normal post with `big.png` attached → switch on                                           | The G-1 toast                                                                                           |
| G-7 | A normal post with `drawing.svg` attached → switch on                                       | The G-4 toast                                                                                           |
| G-8 | Apply the lock, then attach `drawing.svg` and `big.png` to the **teaser** → Post            | Not blocked. Teaser attachments are public files and are not checked. Both show in the published teaser |
| G-9 | Lock and publish a normal post within the limits (text + 2 images), unlock it as the reader | Shows as an image gallery, as before                                                                    |

## Known behaviour — do not report as bugs

1. In an article, right after typing the title or body, the switch can look disabled for about half a
   second.
2. The "9.5MB" in the limit toast is the server's 10,000,000 bytes rounded down in MiB, like the app's
   other size labels.
3. Content with an SVG cannot be locked yet (#2683).
4. Own posts show skeletons while their content loads. On a later visit, cached text can appear before
   attachment bytes; see "Reading your own post" (#2573, #2757, #2561).
