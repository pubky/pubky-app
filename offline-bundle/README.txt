Pubky App, offline bundle
=========================

This folder is the whole Pubky App web client. It runs on your own computer and
talks only to Pubky homeservers and relays, with no Pubky App server in between.

How to start it
---------------

You need either Python 3 or Node.js installed. Open a terminal in this folder and
run one of these:

    python3 serve.py        (on Windows: py serve.py)
    node serve.mjs

Your browser opens http://127.0.0.1:8473/ . Keep the terminal open while you use
the app; press Ctrl+C in it to stop.

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
- Opening index.html directly (a file:// address) does not work. Use the
  commands above.

Not available in this version
-----------------------------

Feedback and report forms (use the email link instead), the copyright form,
link previews for web pages, the Shop, Locks (paid posts) and "Continue with
Google".
