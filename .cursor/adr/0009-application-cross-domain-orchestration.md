# ADR 0009: Application Layer Cross-Domain Orchestration

## Status

Accepted — 2025-11-21

## Context

Complex user workflows often require coordinating operations across multiple domains. For example, creating a post with file attachments and tags involves three distinct domain operations:

1. **File upload** (FileApplication)
2. **Post creation** (PostApplication)
3. **Tag association** (TagApplication)

These operations must be orchestrated as a single cohesive workflow with proper ordering (files before post, post before tags) and transactional semantics.

Under the current architecture (ADR-0004), the allowed dependencies are:

```
UI → Controllers → Application → Services
```

This creates a design challenge:

- **Controllers can only call Application** (not other Controllers)
- **Application can only call Services** (no cross-Application calls documented)
- **No cross-domain orchestration layer exists**

This forces a choice between three unsatisfactory approaches:

1. **UI orchestration**: Have UI components coordinate multiple controller calls, leaking business logic into the presentation layer
2. **Duplication**: Duplicate file upload and tag creation logic inside PostApplication, violating DRY principles
3. **Service bypass**: Have controllers call services directly, bypassing the Application orchestration layer

None of these approaches align with clean architecture principles.

The fundamental issue: **Where does cross-domain orchestration belong?**

## Decision

**Allow Application layer classes to call other Application layer classes** for workflow orchestration, with the following constraints:

### Core Rules

1. **Horizontal calls permitted**: Application classes MAY call other Application classes within the same layer
2. **Acyclic dependency graph**: Circular dependencies between Application classes are FORBIDDEN
3. **Maximum call depth of 1**: If Application A calls Application B, then B MUST NOT call any other Application class within that execution flow
4. **Orchestration privilege**: `PostApplication` and `UserApplication` are permitted to call other Application classes. `NotificationApplication` is also permitted as a scoped exception defined by ADR-0010 (read-only hydration before notification persistence). All other Application classes (FileApplication, TagApplication, BookmarkApplication, etc.) MUST NOT call other Application classes, including PostApplication, UserApplication, or NotificationApplication. This ensures orchestrators can coordinate cross-domain workflows while specialized domains remain independent and cannot create reverse dependencies on core entities.

### Example

```typescript
// ✅ ALLOWED: PostApplication (orchestrator) calls helper applications
class PostApplication {
  static async createWithAttachments({ files, tags, post }) {
    // Depth 0 → Depth 1
    await FileApplication.upload(files); // OK (PostApplication can call others)
    await PostApplication.create(post); // OK (same class)
    await TagApplication.commitCreate(tags); // OK (PostApplication can call others)
  }
}

// ✅ ALLOWED: UserApplication (orchestrator) calls helper applications
class UserApplication {
  static async createWithProfile({ user, avatar }) {
    await FileApplication.upload([avatar]); // OK (UserApplication can call others)
    await UserApplication.create(user); // OK (same class)
  }
}

// ❌ FORBIDDEN: Specialized applications cannot call other applications
class FileApplication {
  static async upload(files) {
    // NOT ALLOWED: FileApplication cannot call other Application classes
    await TagApplication.commitCreate(tags); // ❌ VIOLATION
    await PostApplication.validate(); // ❌ VIOLATION
    await UserApplication.getProfile(); // ❌ VIOLATION
  }
}

// ❌ FORBIDDEN: Specialized applications cannot call PostApplication or UserApplication
class TagApplication {
  static async create(tag) {
    await PostApplication.getById(tag.postId); // ❌ VIOLATION
    await UserApplication.getById(tag.userId); // ❌ VIOLATION
  }
}

// ❌ FORBIDDEN: Deep chains (even from orchestrators)
class PostApplication {
  static async createWithAttachments({ files, tags, post }) {
    await FileApplication.upload(files); // OK (Depth 0 → 1)
  }
}
class FileApplication {
  static async upload(files) {
    // Depth 1 → Depth 2 (violates max depth rule)
    await ImageProcessorApplication.process(); // ❌ NOT ALLOWED (also violates rule 4)
  }
}

// ❌ FORBIDDEN: Circular dependencies
class PostApplication {
  static async create() {
    await FileApplication.upload(); // A → B
  }
}
class FileApplication {
  static async upload() {
    await PostApplication.validate(); // B → A (circular! also violates rule 4)
  }
}
```

### Enforcement Strategy

⚠️ **Critical Limitation**: Our architecture uses **static classes without dependency injection**. Therefore:

- ✅ Dependencies are explicit in code (searchable)
- ❌ Dependencies are NOT visible in type signatures
- ❌ Circular dependencies are NOT caught at compile time
- ❌ Call depth is NOT enforced by TypeScript

**We rely on:**

1. **Code Reviews**: Reviewers MUST check for:
   - Circular dependencies
   - Excessive call depth (max depth 1)
   - **Orchestration privilege violations** (only PostApplication/UserApplication/NotificationApplication can call other Applications)
2. **Documentation**: This ADR as the source of truth
3. **Testing**: Integration tests to catch violations at runtime
4. **Code Comments**: Developers MUST document cross-Application calls with ADR reference

**Future Tooling** (optional, not required now):

- dependency-cruiser for circular dependency detection
- Custom ESLint rules for call depth validation
- Type-level dependency tracking (TypeScript 5.x features)

### Guidelines for Use

**When TO use cross-Application calls:**

- ✅ Single user action requires multi-domain coordination
- ✅ Complex workflow with ordering/transactional requirements
- ✅ Avoiding code duplication of orchestration logic
- ✅ **Only from PostApplication, UserApplication, or NotificationApplication** (NotificationApplication is constrained by ADR-0010)

**When NOT to use:**

- ❌ Simple read operations (use services directly)
- ❌ Single-domain workflows (stay within one Application)
- ❌ Deep processing chains (refactor to flatten)
- ❌ **From specialized Application classes** (FileApplication, TagApplication, BookmarkApplication, etc.) - these must remain independent and cannot depend on PostApplication, UserApplication, or NotificationApplication

## Consequences

### Positive ✅

- **Proper orchestration location**: Cross-domain workflows stay in Application layer (not UI, not Services)
- **Code reuse**: Avoid duplicating file upload, tag creation logic across Application classes
- **Single responsibility preserved**: Each Application class maintains its domain focus
- **Testability**: Can mock cross-Application dependencies in unit tests
- **Matches orchestration role**: Application layer is ALREADY responsible for orchestrating services; this extends to orchestrating other applications

### Negative ❌

- **Increased coupling**: Application classes now depend on each other
- **Hidden dependencies**: Static classes don't declare dependencies in signatures
- **Review burden**: Code reviewers must manually verify architectural constraints
- **Testing complexity**: More mocking required (mock cross-Application calls)

### Neutral ⚠️

- **Requires discipline**: Team must enforce rules through reviews and testing
- **Documentation-heavy**: Constraints live in docs, not code
- **Potential for misuse**: Easy to create deep chains or circular dependencies if not careful
- **Future refactor possible**: Could move to dependency injection later for compile-time enforcement

## Alternatives Considered

### Alternative 1: Full Dependency Injection Refactor

**Description**: Move from static classes to instance-based classes with constructor injection.

```typescript
class PostApplication {
  constructor(
    private fileApp: FileApplication,
    private tagApp: TagApplication,
    private postService: LocalPostService,
  ) {}

  async create({ files, tags, post }) {
    await this.fileApp.upload(files);
    await this.tagApp.create(tags);
  }
}
```

**Pros**:

- Explicit dependencies in constructor
- Compile-time circular dependency detection (would fail instantiation)
- Better testability (easier mocking)
- Could enforce call depth with types
- Industry standard pattern

**Cons**:

- **Massive refactor** (affects every Controller, Application, Service)
- Need DI container or manual wiring
- Increased boilerplate
- Initialization complexity
- Team learning curve
- No immediate business value

**Why not chosen**: The refactor scope is too large for the immediate problem. This could be reconsidered later if:

- Architecture violations become frequent
- Team size grows beyond effective code review capacity
- Complexity requires stronger compile-time guarantees

### Alternative 2: UI Orchestration

**Description**: Have UI components coordinate multiple controller calls sequentially.

```typescript
// In React component
const handlePostCreate = async () => {
  const fileUrls = await Promise.all(files.map((f) => FileController.upload({ file: f, pubky })));
  await PostController.create({ content, fileUrls });
  await Promise.all(tags.map((tag) => TagController.commitCreate({ taggedId: postId, label: tag })));
};
```

**Pros**:

- No architecture changes needed
- Clear separation between domains
- Easy to understand flow

**Cons**:

- Business logic leaks into UI layer
- Orchestration logic scattered across components
- Hard to test (requires UI component testing)
- Error handling becomes complex
- Violates separation of concerns

**Why not chosen**: Business logic belongs in the domain layer, not presentation layer. This approach makes the UI responsible for orchestration, which is not its role.

### Alternative 3: Duplicate Orchestration Logic

**Description**: Each Application class duplicates the logic of other applications it needs.

```typescript
class PostApplication {
  static async create({ files, tags, post }) {
    // Duplicate FileApplication.upload logic
    for (const file of files) {
      await HomeserverService.putBlob(...);
      await HomeserverService.request(...);
      await LocalFileService.create(...);
    }

    // Duplicate TagApplication.create logic
    for (const tag of tags) {
      await LocalPostTagService.create(...);
      await HomeserverService.request(...);
    }

    // Post creation logic
    await LocalPostService.create(...);
  }
}
```

**Pros**:

- No cross-Application dependencies
- Each Application fully independent
- Easy to reason about (all logic in one place)

**Cons**:

- Violates DRY principle (logic duplicated 2-3x)
- Hard to maintain (changes needed in multiple places)
- Inconsistency risk (different implementations drift)
- Increased bug surface area
- Code bloat

**Why not chosen**: The maintenance burden and inconsistency risk outweigh the benefits of independence. Orchestration logic should be reusable.

## Related Decisions

- **ADR-0004: Layering and Dependency Rules** — Establishes base layer flow that this ADR extends.
- **ADR-0010: Notification Application Cross-Domain Orchestration Privilege** — Adds a constrained exception for `NotificationApplication` orchestration.
