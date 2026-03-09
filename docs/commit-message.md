# Commit Message Guidelines

Consistent commit message formatting following conventional commits standard.

## Format

```
<type>(<scope>): <description>

[optional body]

[optional footer(s)]
```

## Types

- **feat**: A new feature
- **fix**: A bug fix
- **docs**: Documentation only changes
- **style**: Changes that don't affect code meaning (formatting, missing semicolons)
- **refactor**: Code change that neither fixes a bug nor adds a feature
- **perf**: Code change that improves performance
- **test**: Adding missing tests or correcting existing tests
- **chore**: Changes to build process or auxiliary tools

## Scope

Optional but recommended. Indicates the area of change:

- **auth**: Authentication/authorization
- **posts**: Post-related features
- **users**: User-related features
- **ui**: UI components
- **core**: Core architecture
- **adr**: Architecture Decision Records
- **deps**: Dependencies

## Description

- Use imperative mood: "add" not "added" or "adds"
- Don't capitalize first letter
- No period at the end
- Maximum 72 characters

## Examples

### Good

```
feat(auth): add recovery phrase login
fix(posts): correct timestamp formatting in feed
docs(adr): add ADR for local-first writes
refactor(core): extract user validation to pipe
test(ui): add snapshot tests for Button component
chore(deps): update next to 15.3.2
perf(streams): optimize post stream caching
```

### Bad

```
Added new feature            (no type, capitalized, vague)
feat: New button             (capitalized description)
fix posts bug.               (no scope format, period at end)
Updated stuff                (no type, vague)
```

## Multi-line Commits

For complex changes, use body and footer:

```
feat(core): implement local-first write model

This commit introduces local-first writes that commit to Dexie
before syncing to the homeserver, improving perceived responsiveness.

Changes:
- Add LocalWriteService for managing pending writes
- Implement background sync queue
- Add conflict resolution strategy

Refs: #123
```

## Breaking Changes

Use `BREAKING CHANGE:` in footer:

```
feat(api)!: change post ID format to composite

BREAKING CHANGE: Post IDs now use author:postId format instead of
simple postId. This affects all post-related APIs and database schemas.
```

## Tips

1. Think of the commit message as completing: "If applied, this commit will [your message]"
2. Keep the first line short — it appears in logs and should be scannable
3. Use the body for "why" — the diff shows "what"
4. Reference issues — use `Refs: #123` or `Closes: #456` in footer
5. Group related changes — don't mix refactoring with features

## Verification

- [ ] Follows `type(scope): description` format?
- [ ] Type is appropriate (feat/fix/docs/etc)?
- [ ] Description in imperative mood?
- [ ] First line under 72 characters?
- [ ] Clearly explains what changed?
