---
name: pubky-staging-invite
description: Mints a single-use signup token for the Pubky staging homeserver. Use when the user explicitly asks for a new staging invite code or signup token; do not mint a token for informational questions about signup.
compatibility: Requires Bash, curl, and outbound HTTPS access to admin.homeserver.staging.pubky.app. Credential caching supports macOS Keychain and Linux Secret Service; the permission-restricted XDG file fallback on Linux also requires Git for its worktree safety check.
---

# Pubky Staging Invite

Mint only the number of tokens the user explicitly requested. Generating a token changes server state; a question about signup or where to enter a token is not authorization to create one.

## Generate a token

Resolve bundled script paths against the directory containing this `SKILL.md`, then invoke the generator by its resolved path. For example, when the current directory is the skill directory:

```bash
bash scripts/generate.sh
```

The script looks for the admin password in this order:

1. `PUBKY_STAGING_ADMIN_PASSWORD` in the current process environment.
2. macOS Keychain or Linux Secret Service.
3. The Linux XDG credential file created by `scripts/configure.sh` when Secret Service is unavailable.

If no saved credential exists, ask the user to resolve and run the setup script the same way, once, in an interactive local terminal:

```bash
bash scripts/configure.sh
```

The setup script prompts without echoing the password. Do not ask the user to paste it into chat, put it in a command argument, or save it inside a repository. On headless Linux without Secret Service, the fallback file uses the XDG config directory with mode `0600` and refuses to save inside a Git worktree.

On success, `scripts/generate.sh` writes exactly one invite code to stdout. Return that code to the user without saving it. On failure, report the concise diagnostic from stderr and do not invent a code. Do not automatically retry a timeout or other ambiguous network failure because the first request may already have minted a token.

Each code is single-use and valid only for the staging homeserver `8um71us3fyw6h8wbcxb5ar3rwusy1a6u49ba7eabxpqi8gnetewy` used by shop.pubky.app and staging Pubky App accounts.

The user enters it in Pubky App sign-up under **Invite code**. If a fresh code is rejected, first confirm that the app targets the staging homeserver and that an earlier signup attempt did not consume it.