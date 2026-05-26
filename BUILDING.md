# Building relias-mcp

## Prerequisites

- Node ≥ 22 (LTS). Local dev on newer is fine; CI pins Node 22.
- npm (bundled with Node).

## Setup

```bash
npm ci
```

## The dev loop

| Command              | What it does                                   |
| -------------------- | ---------------------------------------------- |
| `npm run build`      | Compile `src/` → `dist/` (tsc).                |
| `npm run typecheck`  | Type-check without emitting (`tsc --noEmit`).  |
| `npm run lint`       | ESLint + Prettier check.                       |
| `npm run format`     | Auto-format with Prettier.                     |
| `npm test`           | Run Vitest once with coverage (80% threshold). |
| `npm run test:watch` | Vitest in watch mode.                          |
| `npm run dev:cli`    | Run the CLI entry from source via tsx.         |
| `npm run dev:mcp`    | Run the MCP server entry from source via tsx.  |

## What CI enforces

Every PR must pass (see `.github/workflows/ci.yml`):

1. `npm run lint`
2. `npm run typecheck`
3. `npm test` — ≥ 80% coverage on `src/lib/**` (LD-RM-09)

Plus the OCS-Ecosystem conventions: conventional-commit messages with the feature/chore
ID in scope, PR title leading with the ID, an `Addresses:` line, and a `pr-review-log.md`
entry (Marty's 5% practice).

## Coverage policy

Coverage is measured on `src/lib/**` only. The CLI and MCP entry points (`src/cli.ts`,
`src/mcp.ts`) are thin composition layers exercised by their own e2e suites (F5/F6);
type-only files (`src/lib/types.ts`) compile away and carry no coverage. See
`vitest.config.ts`.

## Module system

ESM throughout (`"type": "module"`). Use `.js` extensions in relative import specifiers
even when importing `.ts` source — that's NodeNext resolution, not a typo.
