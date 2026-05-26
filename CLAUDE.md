# CLAUDE.md — relias-mcp

This is the citizen charter for `relias-mcp`. It's written in **tutor voice**: Marty is
learning Node/TypeScript alongside this build, so explanations lean toward "why," not just
"what." Where this document and the ecosystem `OCS-Ecosystem/CLAUDE.md` disagree, this one
wins for matters internal to relias-mcp; the ecosystem doc wins for cross-citizen matters.

## What this is

One Node/TypeScript package with three personalities:

- a **library** (`src/lib/`) — the product. Pulls the COPE-approved Relias catalog,
  snapshots it to git, diffs snapshots, and reconciles the catalog against a file (PDF,
  XLSX, CSV, DOCX).
- a **CLI** (`src/cli.ts`) — a thin layer for terminal users and cron.
- an **MCP server** (`src/mcp.ts`) — a thin layer for Claude and Claude Code.

Build the library first; the CLI and MCP compose it. If you're tempted to put logic in the
CLI or the MCP server, stop — it belongs in `src/lib/` where both can reach it and tests
can hit it directly.

## Authorization model (non-negotiable)

This binds the ecosystem authorization protocol to relias-mcp's gates:

1. Specs are context, not work orders. The spec at `docs/specs/relias-mcp-v1.0.md` describes
   the whole build; it does **not** authorize building it.
2. Work begins ONLY when Marty gives explicit instruction in the current chat session.
3. Passing tests within a feature loop authorizes completing that loop — nothing more.
4. Moving to the next phase (next F-number) requires explicit authorization.
5. Chores (C-numbered, in `docs/specs/…-chores.md`) are Marty's to perform. Don't assume a
   chore is done — the phase ladder says which chore gates which phase; if a gate isn't
   confirmed, ask before relying on it.

## Stack (LD-RM-09, LD-RM-10)

- **TypeScript strict, ESM, Node 22 LTS, npm.** ESM means relative imports use `.js`
  extensions even for `.ts` source (NodeNext resolution). That looks wrong if you're used to
  CommonJS; it isn't.
- **Vitest**, 80% coverage on `src/lib/**`.
- Library picks, added per feature (not all at P0): `openid-client` v6, native `fetch`,
  `pdf-parse`, `xlsx`, `papaparse`, `mammoth`, `zod` v3, `pino`,
  `@modelcontextprotocol/sdk`. The diff engine is hand-rolled.

## Conventions (LD-RM-14)

- **kebab-case** for files, directories, branches, MCP tool names, and the npm package name.
- **SCREAMING_SNAKE_CASE** for environment variables (Unix convention).
- Language-native for code identifiers: `camelCase` variables, `PascalCase` classes.
- Conventional commits with the feature/chore ID in scope: `feat(F1): add OIDC client`,
  `chore(C11): branch protection`. PR titles lead with the ID. Every PR has an `Addresses:`
  line. Rebase-and-merge only — no squash, no merge commits.
- `docs/` subdirectories are **plural** (`specs/`, `plans/`, `guides/`, `examples/`) per the
  ecosystem rule locked 2026-05-25. The v1.0 spec's §9 drew them singular — that's a known
  defect; the plural names here are correct.

## 🎓 Exercises (authorship currently suspended)

Two features are marked 🎓 — originally reserved for Marty to implement himself:

- **F1 — OIDC client.** The OAuth/OIDC refresh-token flow. Small and self-contained.
- **F4 — reconciliation engine.** The fuzzy-matching, drift-detection, three-list business
  logic Marty cares about most. (The four file parsers in F4 are boilerplate either way.)

**As of 2026-05-26, 🎓 authorship is suspended** under the ecosystem's read/review mode
(see `OCS-Ecosystem/CLAUDE.md` → "The 5% Learning Practice"): TypeScript is overwhelming to
author cold and the build is under deadline, so **Claude Code implements these too and Marty
reviews them** line-by-line. The 🎓 marker now means "extra review attention," not "Marty
writes it." This flips back when the mode changes.

## Architecture in one breath

`ReliasClient` (= `OidcAuth` + `SearchApi`) pulls the catalog. `SnapshotStore` (interface)
persists it; v1.0 ships `GitJsonSnapshotStore` (commits JSON to the separate
`cook-county-ocs/ocs-relias-snapshots` repo via a deploy key — no database in v1.0, that's
LD-RM-02). `DiffEngine` compares two snapshots. `FileParser` (interface, four impls) +
`ReconciliationEngine` compare a parsed file against the latest snapshot. All persistence
goes through `SnapshotStore` so a future Neon swap is a new implementation, not a rewrite
(LD-RM-03).

The cron runs the **CLI**, never the MCP server. The MCP server is for interactive use.

## Things you don't need to worry about

- The `pendo` and `wm-state` cookies in the discovery findings are analytics/UI-state
  cookies on the website host. They are irrelevant to the JSON API. Ignore them.
- Multi-org support. AOIC's `orgID=20084` is the hardcoded default (configurable via env,
  but don't build the multi-org abstraction — LD-RM-05 non-goal).
- Writing to Relias. v1.0 is read-only against Relias. The only writes are to _our_
  infrastructure (the snapshots repo, via cron).

## Stakeholder

Project stakeholder for this build is **Tamar Stockley (SCPO)**. The previous sponsor,
Dr. Miquel Lewis, is retired — don't reference him as current.

## Outputs

If this citizen ever emits a PDF, the Producer field is **"OCS Support Bot"** — no AI
attribution (ecosystem rule). No external font URLs; WCAG 2.1 AA for any visual artifact.
