Pubky App, offline bundle
=========================

This folder is the whole Pubky App web client. It runs on your own computer and
talks only to Pubky homeservers and relays, with no Pubky App server in between.

How to start it
---------------

Open the launcher for your computer (keep all the files of this folder together):

    macOS (Apple chip)   pubky-app-macos-arm64
    macOS (Intel)        pubky-app-macos-intel
    Windows              pubky-app-windows.exe
    Linux                pubky-app-linux

Your browser opens http://127.0.0.1:8473/ . Keep the launcher's window open while
you use the app; close it (or press Ctrl+C in it) to stop.

The launchers are not signed yet, so the system warns the first time:
- macOS: right-click the file, choose Open, then Open again. If it still refuses,
  run this in Terminal from this folder:  xattr -d com.apple.quarantine pubky-app-macos-*
- Windows: on "Windows protected your PC" choose More info, then Run anyway.
- Linux: if it does not start, run  chmod +x pubky-app-linux  first.

With Python 3 or Node.js installed, this works too, from a terminal in this folder:

    python3 serve.py        (on Windows: py serve.py)
    node serve.mjs

Good to know
------------

- Always use the same address, http://127.0.0.1:8473/ . The browser keeps your
  session and the app's data per address, so a different port or "localhost"
  instead of "127.0.0.1" starts from scratch.
- If it says the port is busy, another copy is already running (or another
  program uses port 8473). Close it and start again.
- The first time you open it, images may be missing until you reload the page
  once. After that they load normally.
- Sign in by scanning the QR code with Pubky Ring on your phone.
- Opening index.html directly (a file:// address) does not work. Use a launcher.

Not available in this version
-----------------------------

The feedback form, the report and copyright forms (they open an email instead),
previews and embeds of links to other sites (they stay plain links), the Shop,
unlocking paid posts, and "Continue with Google".
