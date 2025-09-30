# Fix TypeScript Type Errors

## Process

1. **Run the precommit check first**
   ```bash
   pnpm run precommit
   ```
   This will identify all type errors that need to be fixed.

2. **Use the TypeScript LSP MCP for type discovery**
   - Use `mcp__typescript-lsp__get_info_on_location` to understand the expected types
   - Use `mcp__typescript-lsp__get_completions` to discover available imports and methods
   - Use `mcp__typescript-lsp__get_code_actions` to find automatic fixes

3. **Import types from packages**
   - Always prefer importing types directly from packages rather than creating custom types
   - Example: `import type { User } from '@supabase/supabase-js'`
   - Look for existing type definitions in node_modules before creating new ones

4. **Look up canonical implementations**
   - Check the package documentation for the proper way to type things
   - Review similar code in the codebase for patterns
   - Consult official TypeScript docs for built-in utility types

5. **Type assertion guidelines**
   - Only use `as` typecasting as a last resort
   - Before using `as`, try:
     - Type guards: `if (typeof x === 'string')`
     - Type predicates: `function isUser(obj: unknown): obj is User`
     - Proper generic types
     - Union types or discriminated unions

6. **Never use `any`**
   - Using `any` will just create another type error in strict mode
   - Instead use:
     - `unknown` when you need to accept any type but will check it
     - Specific union types when possible
     - Generic constraints when working with flexible types

## Example workflow

```typescript
// ❌ Bad - using any
const data: any = await fetch('/api/user')

// ❌ Bad - unnecessary type assertion
const user = data as User

// ✅ Good - proper typing with validation
import type { User } from '@/types/user'

const response = await fetch('/api/user')
const data: unknown = await response.json()

// Validate the data structure
if (isUser(data)) {
  // data is now properly typed as User
  console.log(data.name)
}
```

## Common type imports

- Supabase: `import type { Database } from '@/types/database'`
- React: `import type { FC, ReactNode, HTMLAttributes } from 'react'`
- Next.js: `import type { NextRequest, NextResponse } from 'next/server'`