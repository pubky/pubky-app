/**
 * Cast a value to `T` for tests that deliberately exercise runtime robustness
 * against invalid inputs — e.g. passing `null` where a `string` is expected to
 * verify the production code guards against it.
 *
 * Using this named helper preserves the "this is intentional" signal while
 * keeping the ESLint ban on `as any` / `as unknown as …` in test files active,
 * so accidental casts stand out.
 */
export const asInvalid = <T>(value: unknown): T => value as T;

/**
 * Cast a value to `T` when `T` is an opaque external type that cannot be
 * instantiated legitimately in a test (e.g. an SDK class with a private
 * constructor) and there is no dedicated factory for it below.
 *
 * Prefer a concrete factory (`mockSession`, `mockKeypair`, …) where one exists.
 */
export const asOpaque = <T>(value: unknown): T => value as T;
