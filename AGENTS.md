# Agent Guidelines

- use pnpm as the package manager.
- use bun as the runtime environment. but only use bun features that are node-compatible. build time can be bun-specific.
- Write all code in TypeScript.
- Use Zod for schema validation.
- Prefer using Zod schemas for validation over manual type checking and type conversion.
- use interfaces over Zod schemas for internal type definitions when no validation or type conversion is needed.
- Bun has bug. it give undefined for connection id and do not call connectionClosed callback and returned value of getConnectionStats is incorrect. because we are node-compatible, when we use node to run the code, these issues do not happen. we hope bun will fix these issues in the future.
- make sure no TypeScript errors exist.
- See the changelog guidelines in ai-docs: [ai-docs/changelog-guidelines.md](ai-docs/changelog-guidelines.md)
