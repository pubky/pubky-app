## Summary

<!-- What changes and why. Link the issue: Closes #123 -->

## Verification

<!-- Tick what actually ran; name the targeted test files if not the full suite. -->

- [ ] `npm run lint` and `npm run typecheck`
- [ ] `npm test` (full) or targeted: `npm test -- <files>`
- [ ] `npm run build` (route- or config-wide changes)
- [ ] `npm run test:vrt` (only when a VRT surface changed)

## Callouts

<!-- Delete the lines that do not apply. See AGENTS.md and docs/commit-message.md. -->

- [ ] Touches a surface covered by a VRT → baseline regeneration dispatched via **VRT Update Baselines** (no local baselines committed)
- [ ] Adds or changes an ADR (`docs/adr/`)
- [ ] Bumps `DB_VERSION` or changes a Dexie index map (local database is recreated for every user)
- [ ] Changes a `src/config/*` limit (product-wide policy)
- [ ] Changes a convention → `docs/`, `AGENTS.md` and `.greptile/config.json` updated
- [ ] Invalidates a Cypress spec → flagged for QA here (not edited)

## Screenshots

<!-- UI changes: desktop and mobile, loading/empty/error states where relevant. -->
