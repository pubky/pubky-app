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

Checked against `dev` on 2026-10-09 (`@synonymdev/locks-sdk` 0.1.0-rc9). Changes that are not merged
yet are marked as such.

## The parts

| Part            | Role for the creator                                                                                              |
| --------------- | ----------------------------------------------------------------------------------------------------------------- |
| **pubky-app**   | The composer, the setup dialog, the price dialog. Holds no keys and no money.                                     |
| **Lock Server** | Stores the lock and verifies payments. The creator authorizes it once; that session is separate from the sign-in. |
| **Pubky Ring**  | Approves the Lock Server authorization. Also approves the extra homeserver permission for old sessions (#2373).   |
| **Bitkit**      | The payout wallet. Connected once through the Paykit setup page inside the dialog.                                |

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

## What survives a page reload

|                           | Where it is kept                                                                                        | After a reload                                                                                                                                   |
| ------------------------- | ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Lock Server authorization | The secret from the Ring approval, in localStorage (`locks-auth-store`); the session is rebuilt on load | **Kept.** Ring is not asked again.                                                                                                               |
| Bitkit payout connection  | On the Lock Server. The app asks it on the first dialog open after a page load (#2716).                 | **Kept.** The dialog shows "Checking whether your Bitkit wallet is connected." briefly, then **Locks Enabled**; Continue opens the price dialog. |
| The draft and the price   | Memory only                                                                                             | Gone.                                                                                                                                            |

## The happy path

| #   | You do                                                                                                                                                                      | You see                                                                                                                                                                          | What is happening                                                                                                                                                              |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | Write the **content you want to lock** (text plus an image, or an article). Turn the **Lock content** switch on.                                                            | The switch only works when the draft has text or at least one attachment. Once the lock is applied the article button is gone.                                                   | The draft is captured as the content to lock. It stays visible behind every dialog that follows.                                                                               |
| 2   | First time only: the dialog opens on **Lock Content** ("Pubky Locks allows you to lock content with payments.")                                                             | **Continue** shows a spinner for a moment, then becomes clickable.                                                                                                               | The app checks that the Lock Server answers.                                                                                                                                   |
| 3   | Press **Continue**. **Enable Locks** shows the Lock Server's page: a QR (desktop) or a button that opens Ring (phone). Approve in Ring.                                     | The dialog moves on by itself.                                                                                                                                                   | Ring approves a Lock Server session for this account. The secret goes to localStorage.                                                                                         |
| 4   | Old sessions only (#2373): **Enable Locks (2/2)**. Approve in Ring again.                                                                                                   | The two steps are numbered (1/2) and (2/2) only when both were pending when the dialog opened.                                                                                   | The homeserver session is replaced by one that may read the `/priv` area. Nothing else changes; you stay signed in.                                                            |
| 5   | **Enable Payments**: "Checking whether your Bitkit wallet is connected." then Paykit's setup page: a QR (desktop) or a button that opens Bitkit (phone). Approve in Bitkit. | If the payout account was connected before, this step is skipped after the check.                                                                                                | The Lock Server is asked whether this creator's Paykit setup is done. If not, Paykit's setup page binds the Bitkit wallet as the payout account.                               |
| 6   | **Locks Enabled** ("You authorized the Locks server to manage your Locks data."). Press **Continue**.                                                                       |                                                                                                                                                                                  |                                                                                                                                                                                |
| 7   | **Lock Content**: enter a **Bitcoin Amount** in sats. Press **Apply Lock**.                                                                                                 | The USD value appears next to the amount. Apply Lock stays disabled for an empty value, `0` or a negative number. A decimal is cut at the dot: `1.5` becomes `1`.                | Only the price is recorded. Nothing is uploaded yet.                                                                                                                           |
| 8   | The composer is now empty. Write the **teaser** and the lock title (the field inside the lock card, default "Locked content"). Press **Post**.                              | The lock card with the title and the price previews inside the composer.                                                                                                         | Publishing uploads the locked post and its files to the creator's `/priv/app.locks/content/`, registers the lock, then posts the teaser with a link to the public `lock.json`. |
| 9   | Look at the timeline.                                                                                                                                                       | The teaser is there at once, with the lock card: title, **Unlock**, price. Readers do not see the locked content; the creator sees it under **My locked content** once it loads. |                                                                                                                                                                                |

The two approvals (steps 3 and 5) happen once per account. After a page reload the dialog still opens: it
shows the Bitkit check, then **Locks Enabled**, and Continue leads to the price dialog. Within one page
session the switch opens the price dialog directly.

## Screens you may meet in the setup dialog

| Screen                                                                                              | Meaning                                                                                                 | Normal?                                   | What to do                                                                                  |
| --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | ----------------------------------------- | ------------------------------------------------------------------------------------------- |
| **Lock Content** with Continue showing a spinner                                                    | The app is checking that the Lock Server answers.                                                       | Yes, for a moment                         | Wait.                                                                                       |
| "The Lock Server is unavailable right now. Please try again later." and Continue disabled           | The Lock Server did not answer.                                                                         | No                                        | Check the Lock Server. The composer and the draft are untouched.                            |
| **Enable Locks** with a QR or a Ring button                                                         | No Lock Server session for this account yet.                                                            | Yes, first time                           | Approve in Ring with the account you are signed in with.                                    |
| **Enable Locks** again after a reload                                                               | The Lock Server rejected the stored secret when the page loaded, and the app cleared it.                | Yes, if the secret was invalidated        | Approve again. With a valid secret this is a bug.                                           |
| "Something went wrong while authorizing the Lock Server." with **Try again**                        | Ring denied, the approval was closed, or the exchange failed.                                           | Expected after a deny                     | Try again and approve.                                                                      |
| The same, with "Approve with the account you are signed in with."                                   | Ring approved with a different identity than the pubky.app account (#2758).                             | Expected for a wrong identity             | Approve with the right identity.                                                            |
| **Enable Locks (1/2)** then **(2/2)**                                                               | The session predates Locks and lacks the `/priv` permission (#2373).                                    | Yes, once per old session                 | Approve both. Nothing is signed out.                                                        |
| **Enable Payments** with "Checking whether your Bitkit wallet is connected."                        | The Lock Server is being asked whether the payout account exists (first dialog open after a page load). | Yes, for a moment                         | Wait. If the account exists the step is skipped.                                            |
| **Enable Payments** with a QR or a Bitkit button                                                    | No payout account yet.                                                                                  | Yes, first time                           | Approve in Bitkit.                                                                          |
| "Something went wrong while checking your Bitkit wallet." and "Payments are unavailable right now." | The Lock Server could not reach Paykit.                                                                 | No                                        | Check Paykit. Try again runs the check again.                                               |
| "Something went wrong while connecting your Bitkit wallet."                                         | The Paykit setup page failed or was denied.                                                             | Expected after a deny                     | Try again. It runs the check first and reopens the setup only if needed.                    |
| **Locks Enabled**                                                                                   | Everything is set up.                                                                                   | Yes                                       | Continue to the price.                                                                      |
| The price dialog opens directly, no setup dialog                                                    | Lock Server session and payout account were both confirmed in this page session.                        | Yes, within one page session              |                                                                                             |
| The setup dialog opens while you press **Post**                                                     | The Lock Server rejected the stored secret during publishing (401).                                     | Expected after the secret was invalidated | Press Continue, approve again, then press **Post** again. The draft and the price are kept. |
| Toast "Something went wrong. Try again." on **Post**                                                | Publishing failed for another reason (network, server error).                                           | No                                        | Press Post again. Nothing was published.                                                    |

The composer never breaks or goes blank in any of these cases. If it does, that is a bug.

## Reading your own post

Open the teaser you published. The content shows without any payment: the app reads the original from
the creator's own `/priv` area. Above the content the lock card stays visible, dimmed, so the price is
still readable, and the label reads **My locked content**. This applies in the feed as well as on the post
page.

Two conditions must both hold: the lock creator and the post author are the signed-in account. A post
that points at someone else's lock is not "own".

Current limitation (#2717): the content appears only after every attachment has downloaded. Until
then the post shows the reader-style lock card with an active **Unlock** button. Two fixes are pending:
#2573 (PR #2772) shows a spinner on the pill while the lock file loads, and #2757 (PR #2780, on top of
#2561) shows the own-lock layout at once with skeletons for the attachments.

## Editing the teaser

Open the edit dialog on the teaser. Only the teaser text and the lock title can be changed. The price
is read-only, taken from the existing `lock.json`. After saving, the locked content and the price are
unchanged and the post still renders as a lock card.

## Scenarios

The expected results below were checked against the code. The ids are stable; other documents refer to
them.

### A. Happy path

**A-1. Turn Locks on and connect the payout account (first time only)**

1. Type anything into the composer and turn the **Lock content** switch on.
2. Press **Continue** on the Lock Content card. Approve the Lock Server in Pubky Ring (QR on desktop,
   button on a phone).
3. The dialog moves to **Enable Payments** on its own. Approve in the creator's Bitkit.

Expected: **Locks Enabled**, then the price dialog. The draft stays visible behind the dialogs the whole
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
label **My locked content**. See "Reading your own post" for the current loading limitation.

**A-5. Edit the teaser**

Open the edit dialog for the teaser.

Expected: only the teaser text and the lock title can be changed; the price is read-only. After saving,
the locked content and the price are unchanged and the post still renders as a lock card.

### B. Unhappy path

**B-1. Publish again after a reload (important)**

1. Finish A-1, then reload the page.
2. Turn the switch on again.

Expected: no Ring approval. The dialog shows "Checking whether your Bitkit wallet is connected." for a
moment, then **Locks Enabled**; Continue opens the price dialog. No Bitkit QR (#2716).
Treat as a failure: being asked to approve in Ring again, or being shown the Bitkit QR when the payout
account was already connected.

**B-2. An article or a collection cannot be the teaser**

Turn the switch on, set a price and press Apply Lock.

Expected: the composer is in teaser mode and the article button is gone.

**B-3. The switch on an empty composer**

Try to turn the switch on with nothing written and nothing attached.

Expected: the switch is disabled and does not turn on. An empty draft must never become locked content.
A draft with only an attachment can be locked.

**B-4. An invalid price**

On the price dialog try an empty value, then `0`, then a negative number, then `1.5`.

Expected: **Apply Lock** stays disabled for the first three (only a positive whole number of sats is
accepted), and the cursor shows the not-allowed state. `1.5` is cut at the dot: the field shows `1` and
Apply Lock is enabled for 1 sat. If the exchange rate cannot be loaded the dialog
says so and the price in sats still works.

**B-5. Cancel partway through the setup**

1. Turn the switch on and cancel the setup dialog.
2. Turn it on again, get to the price dialog, and close it.

Expected: both times you return to writing a normal post with your draft intact. Nothing is left
half-locked.

**B-6. The Lock Server is down**

With the Lock Server stopped, turn the switch on.

Expected: "The Lock Server is unavailable right now. Please try again later." with Continue disabled.
The composer does not break or go blank.

**B-7. The Lock Server rejects the session during publishing**

This is about the Lock Server secret from the Ring approval in A-1, not the Bitkit connection and not
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
After you approve again the dialog closes, the draft and the price are still there, and pressing **Post**
again publishes the lock. You never have to start over, and it never publishes as a normal unlocked
post.

### E-3. A session from before Locks (#2373)

Setup: an account that signed in with Pubky Ring before this build. An account that signed in with a
recovery file or key has every permission and never gets into this state.

1. Turn the switch on.

Expected: **Enable Locks (1/2)** (the Lock Server) and **Enable Locks (2/2)** (the permission). Both must
finish before the price dialog. If you finish only step 1, close and reopen, the remaining step shows as
**Enable Locks** without a number. A new session shows a single unnumbered step.

2. Before step 1, or with another session from before Locks, open your own locked post.

Expected: the permission notice ("Pubky.app needs your permission to read your Locks data on your
homeserver.") instead of the content. After approving, the content shows.

### F. Locked articles with images in the body (#2655)

An article uploads each image to public storage the moment it is inserted. When the switch goes on, the
images become `attachment:n` placeholders in the body and the files go into the lock together with the
cover. The public copies are deleted once the lock is published.

Lines marked **(developer check)** need direct access to the homeserver or Nexus.

**F-1. The main flow**

1. A new article: title, cover (`small-1`), two images (`small-2`, `small-3`) between paragraphs.
2. Switch on → price → Apply → teaser and lock title → Post.
3. Open the teaser.

Expected: the cover on top and the two images between the same paragraphs, in the same order and place.
The feed card shows only the cover.
(developer check) The teaser is a short post with no attachments. The creator's
`/priv/app.locks/content/` holds the body and the three images. The two body images uploaded while
writing are deleted after publishing, and their Nexus copies return 404.

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

1. An article with two body images and **no cover** → switch on → price → Apply.
2. Turn the switch off → the article comes back into the editor → publish normally.

Expected: title, body and images come back. It publishes as a normal article with working images and
no error toast. (Without a cover: with a cover the known cover bug applies, see below.)

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
(developer check) The public copies are deleted. Leaving by reloading or closing the tab leaves them
(#2687).

**F-10. Normal articles still work**

1. Without a lock, publish an article with a title, a cover and two body images.
2. Insert two body images, remove one, publish.

Expected: publishing works as before and the images show in place.
(developer check) In step 2 the public copy of the removed image is deleted after publishing.

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

1. Right after typing or while an image is still uploading, the switch can look disabled for about
   half a second. No reason is shown.
2. An image inserted into an article body is in public storage until the lock is published (#2655,
   accepted).
3. In an article with a cover, applying the lock and then turning the switch off removes the cover and
   shows "Articles support one cover image" (known bug seen in manual testing, not from Locks).
4. The "9.5MB" in the limit toast is the server's 10,000,000 bytes rounded down in MiB, like the app's
   other size labels.
5. Content with an SVG cannot be locked yet (#2683).
6. Reloading while writing an article leaves already-uploaded images in public storage (#2687).
7. The own-post loading limitation described in "Reading your own post" (#2717), until #2573 and #2757
   are merged.
