# Resolving conflicts against the i18n removal (#2305)

PR #2313 removed `next-intl` and all localization infrastructure from the app and inlined the US
English copy at every call site (issue #2305, second part of #2145). It rewrote ~1,000 translation
call sites across ~330 files and deleted `messages/`, `src/i18n/`, and `src/providers/IntlProvider/`.
If your branch predates it, you will likely hit conflicts when rebasing onto `dev`.

This guide is written so you can hand it directly to an AI coding assistant: point it here and ask it
to resolve your conflicts following these rules. The rules are deterministic — almost every conflict
has exactly one correct resolution.

## The one rule

**Keep the migrated structure from `dev`, re-apply your branch's semantic change on top of it, and
turn any translation key your branch uses into a literal US English string — byte-identical to the
value in `messages/en.json`.** Never resolve a conflict by keeping a `t('...')` call, a `next-intl`
import, or the `messages/` directory: none of those exist anymore, and the module no longer resolves.

## Getting the copy catalog

`messages/en.json` is deleted on `dev`, but you still need it as the source of truth for any keys
your branch added or renders. Your own branch still has it:

```bash
# Before you start (or any time — <your-branch> is the pre-rebase ref):
git show <your-branch>:messages/en.json > /tmp/en-catalog.json

# Or from dev history (parent of the commit that last touched it):
git show "$(git rev-list -1 origin/dev -- messages/en.json)^:messages/en.json" > /tmp/en-catalog.json
```

Copy values verbatim. Two encoding details matter:

- ICU escaping: a doubled apostrophe `''` in the catalog renders as a single `'` — inline the
  single apostrophe.
- Unusual characters are intentional: non-breaking spaces (U+00A0 — kept as `{'Use\u00A0'}` in
  `HumanInviteCode.tsx`), en dashes (–), embedded `\n`, and embedded double quotes must be carried
  over exactly. When in doubt, compare bytes, not looks.

## Conflict patterns and their resolutions

### 1. `messages/*.json` — deleted on `dev`, modified on your branch

Git shows a delete/modify conflict. Extract any strings your branch added (see catalog section
above), inline them at their call sites, then accept the deletion:

```bash
git rm messages/en.json   # and any other messages/*.json git lists
```

Never restore the file, even partially.

### 2. Plain `t('key')` calls

`dev`'s side has the literal; your side has the call plus your change. Take the literal form and
re-apply your change to it.

```tsx
// Before (your branch; t bound via useTranslations('dialogs.reply'))
<DialogTitle>{t('title')}</DialogTitle>
// After (resolved — real example: DialogReply.tsx; catalog value of dialogs.reply.title)
<DialogTitle>{'Reply'}</DialogTitle>
```

The same applies to props: `label={t('common.cancel')}` becomes `label={'Cancel'}`.

JSX text stays inside a `{'...'}` expression container — do not convert to bare JSX text. The
container preserves whitespace/newline semantics byte-for-byte and satisfies
`react/no-unescaped-entities` for strings with apostrophes.

### 3. Interpolated `t('key', { ... })` calls

These became template literals with the params inlined:

```tsx
// Before (your branch) — catalog value: "Are you sure you want to delete ''{name}''? People following …"
const tDeleteCollection = useTranslations('dialogs.deleteCollection');
const description = tDeleteCollection('description', { name: title || authorPubky });
// After (resolved — real example: CollectionHero.tsx; note the ICU '' unescaped to ')
const description = `Are you sure you want to delete '${title || authorPubky}'? People following this collection will no longer have access to it. Posts inside the collection will not be deleted.`;
```

### 4. `t.rich(...)` rich text

Inlined as literal JSX, with each chunk-render callback applied to its literal chunk text
(real example: `Home.tsx`):

```tsx
// Before (your branch) — catalog value: landing.title = '<highlight>Unlock</highlight> the web.'
const t = useTranslations('landing');
t.rich('title', {
  highlight: (chunks) => (
    <>
      <span className="text-brand">{chunks}</span>
      <br />
    </>
  ),
});
// After (resolved — real example: Home.tsx)
<>
  <span className="text-brand">{'Unlock'}</span>
  <br />
  {' the web.'}
</>;
```

Watch the spaces around chunk boundaries — they are part of the copy.

### 5. ICU plurals

Explicit singular/plural logic (real example: `ShowMoreReplies.tsx`):

```tsx
const moreRepliesLabel = `${count.toLocaleString('en-US')} more ${count === 1 ? 'reply' : 'replies'}`;
```

`toLocaleString('en-US')` replaces the grouped number the ICU `#` placeholder produced.

### 6. `useFormatter()`

Native `Intl` with `'en-US'`, instantiated at module level:

```tsx
const compactNumber = new Intl.NumberFormat('en-US', { notation: 'compact' }); // CollectionCountBadge, ProfilePageHeader
const disjunctionList = new Intl.ListFormat('en-US', { style: 'long', type: 'disjunction' }); // TaggedAsHeadline

// Usage (real example: ProfilePageHeader.tsx — was format.number(...) + t('followers')):
const followersLabel = `${compactNumber.format(stats.followers)} FOLLOWERS`;
```

### 7. Translation-key maps (`labelKey` / `titleKey` constants)

Key maps now hold final copy, and their fields were renamed accordingly (`labelKey` → `label`,
`titleKey` → `title`), including in sibling `.types.ts` files. Real example from
`Header.constants.ts`:

```ts
'/onboarding/human': { step: 1, title: 'Create account' },
```

If your branch adds an entry to such a map, add it with the final copy, not a key.

### 8. Components whose i18n props were replaced

Some components swapped namespace-style props for copy props. Example: `DialogConfirmDelete` lost
`i18nNamespace` and now takes optional `title` / `description` strings (defaults are the old
delete-post copy). If your branch passes removed props, pass the copy instead.

### 9. Tests

- The global `next-intl` mock in `src/config/test.ts` is gone; so are all local
  `vi.mock('next-intl', ...)` blocks. Delete any your branch adds.
- Assertions match real rendered copy, not key paths: `getByText('Follow')`, never
  `getByText('profile.actions.follow')`.
- Do not import `messages/en.json` in tests; assert literal strings.
- The VRT harness (`src/test-utils/vrt.tsx`) no longer wraps `NextIntlClientProvider` — no
  provider setup is needed for copy.

## Do not reintroduce

- `next-intl` in `package.json` (also not `@swc/helpers` as a direct dependency).
- `messages/`, `src/i18n/`, `src/providers/IntlProvider/`.
- `useTranslations`, `useFormatter`, `getTranslations`, `NextIntlClientProvider`, `t.rich`,
  `t.raw`, or any `@/i18n` import — anywhere, including new files.
- A central message registry or translation-function lookalike. Copy lives inline at the call
  site; duplication across components is accepted (#2305).

## The silent failure mode — check even without conflicts

A branch that adds a **new** file importing `next-intl` merges cleanly — git reports no conflict —
and then fails typecheck, because the package is gone. After resolving (or if your rebase was
conflict-free), this sweep must come back empty:

```bash
grep -rn "next-intl\|useTranslations\|useFormatter\|getTranslations\|NextIntlClientProvider\|@/i18n\|messages/en.json" src cypress
```

## Verify

```bash
npm install            # lockfile changed; stale node_modules cause phantom typecheck errors
rm -rf .next           # stale generated route types can also produce phantom errors
npm run typecheck
npm run lint
npm test
npm run test:vrt       # only needed if your branch touches UI
```

The migration changed zero user-facing copy, so if a test now fails on a string your branch didn't
touch, the resolution introduced drift — diff the string against the catalog rather than updating
the assertion.
