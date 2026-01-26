# Agent Guidelines

- use pnpm as the package manager.
- use bun as the runtime environment. but only use bun features that are node-compatible. build time can be bun-specific.
- Write all code in TypeScript.
- Use Zod for schema validation.
- Prefer using Zod schemas for validation over manual type checking and type conversion.
