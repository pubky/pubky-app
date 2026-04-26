# Environment Variables

This project uses Zod for environment variable validation to ensure type safety and provide sensible defaults.

## Configuration

All environment variables are validated in `src/libs/env/env.ts` using Zod schemas. This provides:

- **Type safety**: All env vars are properly typed
- **Validation**: Invalid values cause startup errors
- **Defaults**: Sensible defaults for all variables
- **Documentation**: Clear indication of what each variable does

## Adding or Modifying Variables

You MUST update **two places** in `src/libs/env/env.ts`:

### 1. Add to `envSchema`

```typescript
const envSchema = z.object({
  // ... existing variables ...
  NEXT_PUBLIC_MY_NEW_VAR: z.string().url().default('https://example.com'),
});
```

### 2. Add to `parseEnv()`

```typescript
function parseEnv(): z.infer<typeof envSchema> {
  const result = envSchema.safeParse({
    // ... existing variables ...
    NEXT_PUBLIC_MY_NEW_VAR: process.env.NEXT_PUBLIC_MY_NEW_VAR,
  });
}
```

### Checklist

- [ ] Added to `envSchema` with Zod validation
- [ ] Added to `parseEnv()` safeParse object
- [ ] Added to `.env.example` with documentation
- [ ] Added to `.env` (local development)
- [ ] Added tests if the variable has special parsing logic

## Usage

Import the validated environment instead of using `process.env` directly:

```typescript
import { Env } from '@/libs/env/env';

const dbVersion = Env.NEXT_PUBLIC_DB_VERSION; // number
const debugMode = Env.NEXT_PUBLIC_DEBUG_MODE; // boolean
const nexusUrl = Env.NEXT_PUBLIC_NEXUS_URL; // string (validated URL)
const cdnUrl = Env.NEXT_PUBLIC_CDN_URL; // string (validated URL)
```

## Setting Variables

1. **Development**: Create a `.env.local` file in the project root
2. **Production**: Set environment variables in your deployment platform
3. **Testing**: Variables are set in `src/config/test.ts`

## Validation Errors

If environment validation fails, you'll see detailed error messages:

```
❌ Environment validation failed:
  - NEXT_PUBLIC_DB_VERSION: Expected number, received string
  - NEXT_PUBLIC_NEXUS_URL: Invalid url
```
