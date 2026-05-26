# relias-mcp v1.0 — Build Spec

**Spec version:** 1.1
**Spec date:** 2026-05-26
**Build version:** v1.0 (the spec versions independently of the build)
**Author:** OCS — Marty (subject) / OCS-1138 (preparer)
**Audience:** Claude Code (primary), Marty (reviewer under 5% practice), successor seats (cold readers)
**Target repo:** `cook-county-ocs/relias-mcp` (new)
**Target path on commit:** `docs/spec/relias-mcp-v1.0.md`
**Companion:** `relias-mcp-v1.0-chores.md` (the operational checklist)
**Supplements:** `relias-discovery-and-reconciliation-findings.md` (2026-05-26) — the Plan A validation that authorizes this build

---

## Spec Changelog

| Spec version | Date | Changes |
|---|---|---|
| 1.0 | 2026-05-26 | Initial release |
| 1.1 | 2026-05-26 | Added §7 Chores (C1–C13) with operational chore tracking; updated §8 Phase Ladder with chore-prereq column; added meta-note on feature/chore division as PM primitive; folded `RELIAS_GH_DISPATCH_TOKEN` into the secrets list (was previously only in §6); pointer to companion `relias-mcp-v1.0-chores.md` doc |

---

## 1. Read This First

You are Claude Code. You are building **relias-mcp** — a Node/TypeScript application with three personalities:

- a **library** that pulls Cook County Juvenile Probation's COPE-approved Relias catalog and reconciles it against AOIC's published PDF
- a **CLI** that exposes the library to terminal users (Marty, Shelly, Leanne) and to cron
- an **MCP server** that exposes the library to Claude and Claude Code

The library is the product. The CLI and MCP are thin layers. Build accordingly: library first, with the CLI and MCP composing it.

This is also the **first citizen** to migrate to the `cook-county-ocs` GitHub Organization. Get the migration sequencing right and the rest of OCS-Ecosystem follows easily. Get it wrong and the second citizen (training-scheduler) inherits the breakage.

Marty is learning Node alongside this build. CLAUDE.md is written in tutor voice. Features marked 🎓 are exercises Marty writes himself before review — those features should ship as PRs with stubs only from your side, with Marty filling in the implementation.

**Two parallel work streams.** This spec splits work into **features** (F-numbered, Claude Code builds) and **chores** (C-numbered, Marty performs). Features are coding; chores are GitHub admin, key generation, secrets, branch protection — operational tasks. Each chore unblocks one or more features. The phase ladder (§8) calls out which chores block which phases so neither side races ahead of the other.

If you're a successor seat reading this cold three months from now: §3 gives you context, §5 is the architecture, §6 is what to build, §7 is what's pre-arranged operationally, §11 is the explicit non-goals so you don't accidentally re-litigate decisions that are already settled.

---

## 2. Why This Spec Exists

OCS has been reconciling AOIC's published COPE PDF against the Relias catalog manually for years. Manual reconciliation is slow, error-prone, and breaks every time AOIC reuses a course code with different hours or renames a course mid-cycle. Today's Plan A discovery (`relias-discovery-and-reconciliation-findings.md`) confirmed that Relias's Course Library is backed by a clean JSON API behind OIDC bearer auth. We can replace the manual reconciliation with a five-second API call.

This spec defines the v1.0 build that does that, plus the architecture that lets v1.1+ extend cleanly into other Relias surfaces (Course Updates, transcripts, schedule, assignment flow).

---

## 3. Project Context (for cold readers)

**The OCS-Ecosystem** is Cook County Juvenile Probation's Office of Career Services workspace. Eight citizen apps. Naming and operating conventions live in `OCS-Ecosystem/docs/conventions.md` (locked Phase 4b, May 2026). Locked decisions in `OCS-Ecosystem/docs/locked-decisions.md`. PR review log at ecosystem root.

**The OCS-Ecosystem stakeholder** for this build is Tamar Stockley (SCPO). The previous project sponsor, Dr. Miquel Lewis, is retired.

**relias-mcp is a citizen.** It follows ecosystem conventions: feature-as-structural-unit (F1, F2…), chore-as-operational-unit (C1, C2…), conventional commits with feature IDs in the scope, rebase-and-merge, branch protection on `main`, kebab-case throughout, tutor-voice `CLAUDE.md`. The full conventions are in `OCS-Ecosystem/docs/conventions.md`.

**The Pacelt-flavored read.** SPO Joe Pacelt — the so-called King of the Slams — has 30 years of institutional knowledge about Relias. He would not have written this spec; he would have told you "you don't need a spec, just open the website." Build it anyway. Successors will thank us.

---

## 4. Locked Decisions

These are immutable for v1.0. Any v1.1+ change requires explicit re-locking with a new LD number.

| ID | Decision | Source |
|---|---|---|
| LD-RM-01 | Single Node/TypeScript package with three entry points: library, CLI, MCP server. No monorepo. | Marty, 2026-05-26 |
| LD-RM-02 | Source of truth is JSON snapshots in a separate git repo (`cook-county-ocs/ocs-relias-snapshots`). No database in v1.0. | Marty, Thread 3 (April 2026), confirmed 2026-05-26 |
| LD-RM-03 | All persistence goes through an abstract `SnapshotStore` interface. v1.0 ships `GitJsonSnapshotStore`. Future Neon swap is a new implementation, not a rewrite. | Marty, 2026-05-26 |
| LD-RM-04 | Auth is OIDC against `login.reliaslearning.com` with refresh-token grant. Initial refresh token bootstrapped manually from a logged-in browser session. | Marty, 2026-05-26 |
| LD-RM-05 | v1.0 scope is catalog reconciliation only. Course Updates page (v1.1), transcripts (v1.5), schedule + assignment (v2.0) are explicit non-goals. | Marty, 2026-05-26 |
| LD-RM-06 | Cron cadence: weekly Monday 06:00 Central (12:00 UTC) via GitHub Actions schedule, plus `workflow_dispatch` for on-demand. | Marty, 2026-05-26 |
| LD-RM-07 | Three MCP tools in v1.0: `relias-get-latest-diff` (snapshot↔snapshot), `relias-force-refresh` (trigger cron), `relias-reconcile-catalog` (PDF/file↔Relias). | Marty, 2026-05-26 |
| LD-RM-08 | Supported file formats for reconciliation: PDF, XLS/XLSX, CSV, DOCX. Direct file input, no pre-parsing. | Marty, 2026-05-26 |
| LD-RM-09 | Stack: TypeScript strict, ESM, Node 22 LTS, npm, Vitest with 80% coverage threshold. | Marty, 2026-05-26 |
| LD-RM-10 | Library picks: `openid-client` v6, native fetch, `pdf-parse`, `xlsx`, `papaparse`, `mammoth`, `zod` v3, `pino`, `@modelcontextprotocol/sdk`. Diff engine hand-rolled. | Marty, 2026-05-26 |
| LD-RM-11 | Migration order to `cook-county-ocs` org: relias-mcp first, training-scheduler second. Other citizens follow later. | Marty, 2026-05-26 |
| LD-RM-12 | Secrets are repo-level for v1.0. Four secrets total: `OCS_RELIAS_SNAPSHOTS_DEPLOY_KEY`, `RELIAS_OIDC_REFRESH_TOKEN`, `RELIAS_GH_DISPATCH_TOKEN`, plus the auto-injected `GITHUB_TOKEN`. Promote `RELIAS_OIDC_REFRESH_TOKEN` to org-level when training-scheduler migrates. | Marty, 2026-05-26 |
| LD-RM-13 | Stakeholder for `CLAUDE.md` is Tamar Stockley. Project sponsor reference updated from Dr. Lewis. | Marty, 2026-05-26 |
| LD-RM-14 | Naming: kebab-case for files, directories, branches, MCP tool names, npm package name. SCREAMING_SNAKE_CASE for environment variables (Unix convention). Language-native conventions for code identifiers (camelCase variables, PascalCase classes). | Marty, 2026-05-26 |
| LD-RM-15 | Feature/chore division: features are F-numbered build work (Claude Code); chores are C-numbered operational work (Marty). Phase ladder shows chore-prereq for each phase. Applies as a meta-pattern to all OCS-Ecosystem citizens going forward. | Marty, 2026-05-26 |

---

## 5. Architecture

### 5.1 Three layers, one package

```
┌─────────────────────────────────────────┐
│  MCP Server      │  CLI                  │
│  src/mcp.ts      │  src/cli.ts           │
└────────────────────────────────────────┐ │
         │                                 │ │
         ▼                                 ▼ │
┌─────────────────────────────────────────┐ │
│         Library (src/lib/*)              │ │
│  ┌─────────────────────────────────────┐ │ │
│  │ ReliasClient                        │ │ │
│  │  ├─ OidcAuth (refresh-token flow)   │ │ │
│  │  └─ SearchApi (course-search calls) │ │ │
│  └─────────────────────────────────────┘ │ │
│  ┌─────────────────────────────────────┐ │ │
│  │ SnapshotStore (interface)           │ │ │
│  │  └─ GitJsonSnapshotStore (impl)     │ │ │
│  └─────────────────────────────────────┘ │ │
│  ┌─────────────────────────────────────┐ │ │
│  │ DiffEngine                          │ │ │
│  └─────────────────────────────────────┘ │ │
│  ┌─────────────────────────────────────┐ │ │
│  │ FileParser (interface)              │ │ │
│  │  ├─ PdfParser                       │ │ │
│  │  ├─ XlsxParser                      │ │ │
│  │  ├─ CsvParser                       │ │ │
│  │  └─ DocxParser                      │ │ │
│  └─────────────────────────────────────┘ │ │
│  ┌─────────────────────────────────────┐ │ │
│  │ ReconciliationEngine                │ │ │
│  └─────────────────────────────────────┘ │ │
└─────────────────────────────────────────┘ │
                                            │
         GitHub Actions cron ────────────────┘
         (runs CLI, never the MCP)
```

### 5.2 What runs where

| Caller | What it invokes | Why |
|---|---|---|
| `cron` (GitHub Actions weekly + on-demand) | CLI `relias-mcp snapshot` | Stateless, no MCP overhead, just pulls catalog and writes snapshot |
| Marty (terminal) | CLI `relias-mcp reconcile <file>` or `relias-mcp diff` | Ad-hoc reconciliation against a freshly-published AOIC PDF |
| Claude / Claude Code | MCP server's three tools | Conversational invocation during planning, analysis, integration work |

The cron NEVER calls the MCP server. The MCP server is a personality for interactive use, not a long-running service.

### 5.3 The `SnapshotStore` abstraction (LD-RM-03 in practice)

```typescript
// src/lib/snapshot-store.ts
export interface SnapshotStore {
  save(snapshot: ReliasSnapshot): Promise<SnapshotMeta>;
  loadLatest(): Promise<ReliasSnapshot | null>;
  list(opts?: ListOpts): Promise<SnapshotMeta[]>;
  loadByMeta(meta: SnapshotMeta): Promise<ReliasSnapshot>;
  saveDiff(diff: ReliasDiff): Promise<void>;
  loadLatestDiff(): Promise<ReliasDiff | null>;
}
```

v1.0 ships `GitJsonSnapshotStore` (clones the snapshots repo to a temp dir, commits + pushes via deploy key). v1.5 or v2.0 ships `NeonSnapshotStore` that implements the same interface against Postgres.

No code outside `src/lib/snapshot-store.ts` and the implementations should ever know how persistence works.

---

## 6. Features (build units, Claude Code)

Six features in v1.0. Build in order. Each feature gets its own F-numbered branch, PR, and `pr-review-log.md` entry.

### F1 — OIDC client 🎓

**What:** A class that holds a refresh token, exchanges it for an access token, and exposes a `getAccessToken(): Promise<string>` method that handles refresh transparently when expiry is near.

**Why 🎓:** This is the conceptual heart of Plan A. Marty writes this feature himself (the OAuth/OIDC flow) after Claude Code scaffolds the file structure, types, and tests. The exercise is small and self-contained.

**Implementation notes:**
- Use `openid-client` v6's `Issuer.discover()` against `https://login.reliaslearning.com`.
- Client ID is `rlms-website` (public client; no client secret).
- Refresh token comes from `process.env.RELIAS_OIDC_REFRESH_TOKEN` (set in chore C8).
- Cache the access token in memory for the process lifetime; refresh when `expires_at - 60 seconds < now`.
- **Secret hygiene:** log the access token's expiry timestamp, never the token itself. Use pino's redact config to scrub `access_token`, `refresh_token`, and `id_token` fields from any structured log.

**Tests (Vitest):**
- Mock the IdP with `nock` or `msw`. Verify: refresh flow on cold start, in-memory caching, refresh-on-near-expiry, error on refresh-token-rotation (Relias may rotate on each grant — verify behavior).
- 80% line coverage minimum.

**Files:**
- `src/lib/oidc-auth.ts`
- `src/lib/oidc-auth.test.ts`
- `src/lib/types.ts` (additions: `OidcTokens`, `OidcAuthOptions`)

**Stub Claude Code provides:** type definitions, test file with TODO blocks, README section. Marty implements the class body.

**Chore prereqs:** C7, C8 (the secret must exist before the CI integration tests can hit a real IdP — unit tests work without it).

### F2 — Search API client

**What:** A class that takes an authenticated OIDC client and exposes `fetchCopeCatalog(): Promise<ReliasCourse[]>` returning all 267 (or however many) COPE-tagged courses.

**Implementation notes:**
- Endpoint: `POST https://searchapi.reliaslearning.com/api/coursesearch`
- Request body shape is in the discovery findings (full contract captured). The body is mostly constant; only `currentPage` varies.
- Page size: try `pageSize=300` first (single request). If response truncates at the actual pageSize, fall back to paginating with `pageSize=25`.
- Backoff: 200ms between paginated requests. No retry on 5xx in v1.0 — log and exit. Retry is v1.1.
- Validate response with Zod schema (`ReliasSearchResponse`). If schema fails, log the offending field path and exit with code 2 (schema drift).
- Filter: only `metaIds: ["12242"]` (COPE). `orgID: 20084` (AOIC). Other filters are constants.

**Tests:**
- Fixture-based: capture one real response (anonymized if necessary, though the catalog is public-facing data) and mock the API with `msw`.
- Test: single-page response, paginated response, schema-drift detection, 5xx surfaces as error.

**Files:**
- `src/lib/search-api.ts`
- `src/lib/search-api.test.ts`
- `src/lib/schemas/relias-search.ts` (Zod schemas)
- `test/fixtures/relias-search-response.json`

**Chore prereqs:** none for unit tests; C7/C8 if integration tests are added.

### F3 — Snapshot store + diff engine

**What:** The `SnapshotStore` interface (LD-RM-03), the `GitJsonSnapshotStore` implementation, and the diff engine that computes `ReliasDiff` from two snapshots.

**Implementation notes:**
- `GitJsonSnapshotStore` clones `cook-county-ocs/ocs-relias-snapshots` to a temp directory on first use. Uses `simple-git` (lightweight Node wrapper for the git CLI) for ops.
- Snapshot filename: `snapshots/YYYY-MM-DDTHH-MM-SSZ.json`. ISO timestamp, Z-terminated, colon-substituted.
- Diff filename: `diffs/YYYY-MM-DDTHH-MM-SSZ-from-PREV_TIMESTAMP.json`.
- Commit message: `feat(snapshot): catalog snapshot YYYY-MM-DD` (conventional commits).
- Push via deploy key. The deploy key is configured per chores C4–C6; the implementation just trusts that `~/.ssh/id_relias_deploy` exists when running in Actions.
- Diff engine: pure function `diff(prev: ReliasSnapshot, next: ReliasSnapshot): ReliasDiff`. Hand-rolled. Primary key is `courseID`.
- `ReliasDiff` shape: `{ added: ReliasCourse[], removed: ReliasCourse[], changed: Array<{ courseID, before, after, fields: string[] }>, summary: { addedCount, removedCount, changedCount } }`.

**Tests:**
- For `GitJsonSnapshotStore`: use a local bare repo as the remote, test the round-trip (save → loadLatest → matches).
- For diff engine: pure-function tests with fixture pairs covering all six cases (only adds, only removes, only changes, mix, empty diff, identical snapshots).

**Files:**
- `src/lib/snapshot-store.ts` (interface)
- `src/lib/git-json-snapshot-store.ts` (implementation)
- `src/lib/diff-engine.ts`
- `src/lib/snapshot-store.test.ts`
- `src/lib/diff-engine.test.ts`
- `test/fixtures/snapshots/*.json`

**Chore prereqs:** C3 (snapshots repo exists), C4–C6 (deploy key configured) for integration tests against the real remote. Unit tests work against a local bare repo without any chore prereqs.

### F4 — File parsers + reconciliation engine 🎓

**What:** Parsers for PDF, XLSX, CSV, DOCX that produce a normalized `ParsedCatalogEntry[]`, plus the reconciliation engine that compares the parsed input against the latest Relias snapshot.

**Why 🎓:** This is the business logic Marty cares about most. He writes the reconciliation algorithm (fuzzy matching, drift detection, three-list output) himself. Claude Code scaffolds the parsers (mostly boilerplate over the library APIs).

**Implementation notes:**

**Parsers:**
- All four implement `FileParser` interface: `parse(buffer: Buffer): Promise<ParsedCatalogEntry[]>`.
- `ParsedCatalogEntry` is normalized to `{ title: string, reliasCode: string | null, hours: number | null, raw: object }`. The `raw` field preserves source-format-specific fields for debugging.
- PDF: `pdf-parse` returns plain text; then regex/heuristic to extract rows. The TY25 catalog has a stable shape (title + code + hours + X-marks). 🎓 Marty writes the regex/parser.
- XLSX: `xlsx` (SheetJS) reads as JSON; map columns by header name (case-insensitive).
- CSV: `papaparse` with `header: true`, dynamic typing.
- DOCX: `mammoth` to text, then same regex as PDF parser.
- Parser selection: by file extension. Unknown extension → error with code 3 (unsupported format).

**Reconciliation engine (🎓):**
- Input: `ParsedCatalogEntry[]` (from PDF/XLSX/CSV/DOCX) + `ReliasSnapshot` (latest from store).
- Output: `ReconciliationResult` with three lists (`inBoth`, `fileOnly`, `reliasOnly`) and a `driftCatalog` of fuzzy-matched suspected pairs.
- Match strategy:
  - Pass 1: exact match on `reliasCode`. Record `inBoth`.
  - Pass 2: for remaining file entries, fuzzy match on title against remaining Relias entries. Use token-sort ratio (Jaro-Winkler or Levenshtein-based; Marty's choice during implementation 🎓). Threshold ≥ 0.85 = `inBoth` (drift). 0.70–0.85 = `driftCatalog` entry with `confidence: medium`.
  - Pass 3: anything still unmatched on either side becomes `fileOnly` or `reliasOnly`.
- For each `driftCatalog` entry: include both sides, similarity score, and a `driftType` enum (`title-only`, `code-only`, `hours-only`, `multi-field`, `version-bump`).

**Tests:**
- Fixture-based: take today's discovery findings (the partial reconciliation, 33 PDF entries) as ground truth. Test reconciliation produces the same in-both/PDF-only/Relias-only counts.
- Edge cases: empty file, empty snapshot, identical entries with different whitespace, the `0.07h` data-entry-error case from the findings.

**Files:**
- `src/lib/file-parsers/pdf-parser.ts`
- `src/lib/file-parsers/xlsx-parser.ts`
- `src/lib/file-parsers/csv-parser.ts`
- `src/lib/file-parsers/docx-parser.ts`
- `src/lib/file-parsers/index.ts` (parser factory by extension)
- `src/lib/reconciliation-engine.ts`
- `src/lib/reconciliation-engine.test.ts`
- `test/fixtures/aoic-cope-pdf-2025-01-29.pdf` (the TY25 PDF, committed to test fixtures)
- `test/fixtures/cope-catalog-snapshot-2026-05-26.json` (snapshot captured today)

**Chore prereqs:** none for unit tests.

### F5 — CLI

**What:** Command-line binary exposing the library to terminal and cron.

**Commands:**

```
relias-mcp snapshot                  Pull latest catalog, save snapshot, save diff vs previous.
                                       Exit 0 on no changes, 0 on changes (still success), nonzero on error.

relias-mcp reconcile <file>          Parse <file> (PDF/XLSX/CSV/DOCX), reconcile against latest snapshot,
                                       write markdown report to stdout (default) or --output.

relias-mcp diff [--from TS] [--to TS]  Print latest diff, or diff between two named snapshots.

relias-mcp doctor                    Verify config: OIDC token present, IdP reachable, snapshots repo
                                       reachable, all four parsers loadable. Exit 0 if healthy, 1 if not.
```

**Implementation notes:**
- Use `commander` for argument parsing.
- All commands respect `--verbose` (pino debug level), `--quiet` (pino error+ only), `--json` (machine-readable output).
- Cron uses `relias-mcp snapshot --json` so its output can be parsed by the Action's notification step.
- Reconciliation output is markdown by default — same shape as the deliverable from today's Plan A run. Marty derives Excel / HTML / other formats from the markdown.

**Tests:**
- E2E with mocked everything (IdP, search API, snapshots repo as local bare git). Verify each command's exit codes, stdout, and side effects.

**Files:**
- `src/cli.ts` (entry point)
- `src/cli/commands/snapshot.ts`
- `src/cli/commands/reconcile.ts`
- `src/cli/commands/diff.ts`
- `src/cli/commands/doctor.ts`
- `src/cli.test.ts`

**Chore prereqs:** none for unit tests; the cron-equivalent integration tests need C5–C8 and C12.

### F6 — MCP server

**What:** The MCP server personality. Three tools per LD-RM-07.

**Tool: `relias-get-latest-diff`**
- Input: none, or `{ since?: ISO8601 }` for older diffs.
- Output: the latest `ReliasDiff` from the store, rendered as markdown summary plus structured JSON.
- Behavior: read-only. Calls `store.loadLatestDiff()`.

**Tool: `relias-force-refresh`**
- Input: `{ reason?: string }` (optional, for audit logs).
- Output: a status message indicating the GitHub Actions workflow was dispatched.
- Behavior: calls GitHub Actions `workflow_dispatch` API on `cook-county-ocs/relias-mcp/.github/workflows/snapshot.yml`. Needs a fine-grained PAT in `RELIAS_GH_DISPATCH_TOKEN` (chore C10).
- This tool does NOT run the snapshot in-process. It triggers the workflow and returns immediately.

**Tool: `relias-reconcile-catalog`**
- Input: `{ filePath: string }` — absolute path to a PDF/XLSX/CSV/DOCX on the MCP host's filesystem.
- Output: `ReconciliationResult` rendered as markdown plus structured JSON.
- Behavior: calls the library's `ReconciliationEngine` against `store.loadLatest()`.

**Implementation notes:**
- Use `@modelcontextprotocol/sdk` with stdio transport.
- All tool inputs validated with Zod.
- All tool outputs include both human-readable markdown and machine-readable JSON.
- Server name: `relias-mcp`. Version: read from `package.json`.

**Tests:**
- Tool-level integration tests with the SDK's test harness.
- Schema-validation tests for every tool's input.

**Files:**
- `src/mcp.ts` (entry point)
- `src/mcp/tools/get-latest-diff.ts`
- `src/mcp/tools/force-refresh.ts`
- `src/mcp/tools/reconcile-catalog.ts`
- `src/mcp.test.ts`

**Chore prereqs:** C9, C10 (PAT must exist for `relias-force-refresh` to actually dispatch).

---

## 7. Chores (operational units, Marty)

Thirteen chores in v1.0. **Full operational detail is in the companion doc `relias-mcp-v1.0-chores.md`** — that doc has the click-by-click and shell commands. This section is the summary view for spec-level cross-reference.

Chores cluster into three batches by timing:

- **Batch 1 (Day 0, ~20 min):** C1–C4 — org and repo creation, keypair generation. Must precede P0.
- **Batch 2 (between P3 and P7, ~15 min):** C5–C8, C11, C12 — deploy keys installed, OIDC harvested, branch protection. Must precede P7.
- **Batch 3 (before P6 merges, ~10 min):** C9, C10 — PAT for `relias-force-refresh`.

C13 is deferred — fires when training-scheduler migrates.

### Summary

| ID | Chore | Batch | Blocks |
|---|---|---|---|
| C1 | Create `cook-county-ocs` GitHub Org | 1 | All features |
| C2 | Create `relias-mcp` repo | 1 | P0 |
| C3 | Create `ocs-relias-snapshots` repo | 1 | F3 integration tests, P7 |
| C4 | Generate SSH deploy keypair | 1 | C5, C6 |
| C5 | Install public key on snapshots repo | 2 | P7 cron push |
| C6 | Install private key as repo secret on relias-mcp | 2 | P7 cron push |
| C7 | Harvest OIDC refresh token from Relias session | 2 | F1 integration, P7 |
| C8 | Install OIDC refresh token as secret | 2 | F1 integration, P7 |
| C9 | Generate fine-grained PAT for `workflow_dispatch` | 3 | F6 `relias-force-refresh` |
| C10 | Install PAT as secret | 3 | F6 `relias-force-refresh` |
| C11 | Branch protection on `relias-mcp` `main` | 2 | (advisory; protects future PRs) |
| C12 | Branch protection on `ocs-relias-snapshots` `main` | 2 | P7 cron push (must permit deploy-key writes) |
| C13 | Promote OIDC secret to org-level (deferred) | — | training-scheduler v1.0 |

### Chore sequencing rules

1. **Never do C5 without C4.** The keypair must exist before the public key can be installed.
2. **Never do C8 without C7 immediately preceding.** The OIDC refresh token from C7 invalidates if you log out, so do C8 in the same browser session.
3. **Never do C10 with the PAT in chat or email.** Treat it like a password. Copy directly from GitHub's one-time display into the GitHub Secrets form.
4. **C11 is best done after P0 lands** so the CI status check names exist and can be required. Doing C11 before P0 means you'll come back and edit the protection rule.
5. **C13 is a marker, not a v1.0 action.** Don't promote secrets to org-level until a second citizen actually needs them.

---

## 8. Phase Ladder

Each phase is a complete commit-and-push to `main` via PR. Marty reviews under 5% practice; PR-review-log entry per PR.

| Phase | What | Branches | PR count | Chore prereqs | Notes |
|---|---|---|---|---|---|
| P0 | Scaffolding: package.json, tsconfig, eslint, prettier, vitest, CI workflow, README, BUILDING, RELEASING, CLAUDE.md, conventions reference | `P0/scaffolding` | 1 | C1, C2 | Bootstraps the repo to a buildable empty state |
| P1 | F1 OIDC client | `F1/oidc-auth` | 1 (🎓 Marty implements) | — (C7/C8 only needed for integration tests; can defer until P7) | First feature, exercises the test setup |
| P2 | F2 Search API client | `F2/search-api` | 1 | — | Depends on F1 for auth |
| P3 | F3 Snapshot store + diff engine | `F3/snapshot-store` | 2 (split: interface+impl, then diff engine) | C3 (snapshots repo exists), optionally C4–C6 for real-remote integration tests | First touch of the snapshots repo |
| P4 | F4 File parsers + reconciliation engine | `F4/file-parsers`, `F4/reconciliation` | 2 (🎓 reconciliation engine is Marty's) | — | Largest phase |
| P5 | F5 CLI | `F5/cli` | 1 | — | Composes F1–F4 |
| P6 | F6 MCP server | `F6/mcp-server` | 1 | **C9, C10** (PAT must exist; otherwise `relias-force-refresh` test fails) | Composes F1–F4 (parallel personality to F5) |
| P7 | GitHub Actions cron + first real run | `P7/cron-workflow` | 1 | **All of C1–C12** (full secret + deploy-key setup must be complete) | First production-equivalent run |
| P8 | v1.0 release tag, RELEASING.md walkthrough, CHANGELOG | `P8/v1-release` | 1 | — | Tag `v1.0.0`. Open separate PR against OCS-Ecosystem for citizen-table update. |

Estimated total: 11 PRs. At Marty's 5% review pace, that's roughly 5.5 hours of review time spread across the build.

---

## 9. Repository Structure

```
relias-mcp/
├── .github/
│   ├── workflows/
│   │   ├── ci.yml                    # PR checks: lint, typecheck, test, coverage
│   │   └── snapshot.yml              # Weekly + workflow_dispatch cron
│   └── dependabot.yml
├── docs/
│   ├── spec/
│   │   ├── relias-mcp-v1.0.md        # this spec
│   │   └── relias-mcp-v1.0-chores.md # operational chores companion
│   ├── plan/
│   ├── guide/
│   └── examples/
├── src/
│   ├── lib/
│   │   ├── oidc-auth.ts
│   │   ├── search-api.ts
│   │   ├── snapshot-store.ts
│   │   ├── git-json-snapshot-store.ts
│   │   ├── diff-engine.ts
│   │   ├── file-parsers/
│   │   ├── reconciliation-engine.ts
│   │   ├── schemas/
│   │   ├── types.ts
│   │   └── index.ts                  # library public API
│   ├── cli/
│   │   ├── commands/
│   │   └── ...
│   ├── mcp/
│   │   └── tools/
│   ├── cli.ts                        # CLI entry point
│   └── mcp.ts                        # MCP entry point
├── test/
│   └── fixtures/
├── BUILDING.md
├── CHANGELOG.md
├── CLAUDE.md                          # tutor voice
├── LICENSE                            # public-by-default; MIT
├── README.md
├── RELEASING.md
├── package.json
├── tsconfig.json
├── vitest.config.ts
├── eslint.config.js
└── .prettierrc
```

### `package.json` essentials

```json
{
  "name": "@cook-county-ocs/relias-mcp",
  "version": "0.0.0",
  "type": "module",
  "engines": { "node": ">=22.0.0" },
  "bin": {
    "relias-mcp": "./dist/cli.js",
    "relias-mcp-server": "./dist/mcp.js"
  },
  "exports": {
    ".": "./dist/lib/index.js"
  }
}
```

---

## 10. CI Verification

PR cannot merge unless:

- `npm run lint` passes (ESLint + Prettier check)
- `npm run typecheck` passes (`tsc --noEmit`)
- `npm test` passes with ≥80% coverage on changed files
- Conventional-commit format on every commit message
- PR title includes feature ID (e.g., `feat(F1): add OIDC client`) or chore ID (e.g., `chore(C11): branch protection`)
- `pr-review-log.md` entry added by Marty (Manifest Agent will eventually enforce this; for v1.0 it's manual)

`ci.yml` runs on every PR. `snapshot.yml` runs on schedule + workflow_dispatch.

---

## 11. Explicit Non-Goals for v1.0

Do not build these. They are LD-RM-05 deferrals.

- **Course Updates page integration** — the legacy ASP.NET surface at `/CourseChanges.aspx`. v1.1.
- **Transcript pulls** — different endpoint family (`enrollmentapi.reliaslearning.com`). v1.5.
- **Schedule view + assignment flow** — write-heavy, needs careful auth review. v2.0.
- **Database backend** — `SnapshotStore` interface is here for v1.5+ Neon swap. Don't build the Neon implementation in v1.0.
- **Webhook surface** — Relias has no webhooks; we won't add them in front. Cron + on-demand only.
- **Multi-org support** — AOIC's `orgID=20084` is hardcoded as the default. Make it configurable in `.env`, but don't build the abstraction for multiple orgs simultaneously.
- **Anything that writes to Relias** — v1.0 is read-only against Relias. The `relias-force-refresh` tool dispatches the snapshot workflow, which is a write to *our* infrastructure, not theirs.
- **Automatic secret rotation** — the OIDC refresh token expires (~30-90 days). v1.0 expects Marty to re-do C7/C8 manually. v1.1 may add a "secrets-expiring-soon" check to the doctor command.

---

## 12. Open Items / Loose Ends

Not blockers for v1.0 but worth knowing about:

1. **Refresh-token rotation behavior.** Relias may rotate the refresh token on each grant. F1 should handle this gracefully — write the new token to a file or surface it for re-secreting. If Relias does rotate and v1.0 can't persist the new token, the cron breaks after one run. Verify during F1 implementation.
2. **`searchapi` rate limits.** Not observed in the discovery run, but a weekly cron is so light it wouldn't surface them anyway. If a future run hits 429, add exponential backoff.
3. **Schema drift on the search response.** F2 validates with Zod and exits with code 2 on drift. The cron's notification step should treat exit code 2 specially — it's not a transient failure, it's a "Relias changed their API" signal worth a human-readable alert.
4. **PDF parsing fragility.** The AOIC TY25 PDF has a stable shape today. Future PDFs may not. F4's PDF parser should fail loudly with a clear "could not extract row N" message rather than silently producing partial output.
5. **The `pendo` and `wm-state` cookies** seen in the discovery findings are analytics/state cookies on the UI host. They don't matter for the API. Mention in CLAUDE.md's "things you don't need to worry about" section.
6. **PAT expiration (C9).** Fine-grained PATs expire in 90 days max. When the PAT expires, `relias-force-refresh` silently breaks. The cron itself doesn't depend on the PAT — only the on-demand MCP dispatch does. A v1.1 enhancement: have the doctor command check PAT expiration and warn when within 14 days.

---

## 13. Resumption Protocol

If you (Claude Code) pick this up after a context reset or a successor pick-up:

1. Read this spec start to finish.
2. Read the companion `relias-mcp-v1.0-chores.md` so you know which chores have been done.
3. Read `OCS-Ecosystem/docs/conventions.md` (ecosystem conventions).
4. Read `OCS-Ecosystem/docs/locked-decisions.md` (ecosystem locked decisions).
5. Read `relias-discovery-and-reconciliation-findings.md` (the Plan A authorization).
6. Check `relias-mcp/pr-review-log.md` to see how far Marty's gotten in his 5% practice.
7. Look at the open PRs and the current phase in the ladder.
8. If anything in this spec contradicts what's on `main`, `main` wins. Surface the contradiction to Marty before continuing.

If you're Marty resuming after a break: §6, §7, and §8 are the only sections you need. Everything else is reference.

---

## 14. Meta-Pattern Note: Feature/Chore Division

This spec introduces a pattern OCS-Ecosystem will inherit going forward (per LD-RM-15):

**Features (F-numbered)** are coding work. Claude Code builds them. They live in branches like `F1/oidc-auth`. They become PRs. They're tracked in CHANGELOG. They have tests. They're reviewable under the 5% practice.

**Chores (C-numbered)** are operational work. Marty (or whoever holds the seat) performs them. They live in checklists. They don't have tests. They're discrete (no partial credit) and quick (minutes, not hours).

The two streams have to interleave correctly. A feature blocked on a chore is a stall; a chore done too early is wasted (e.g., generating a PAT before the workflow that uses it exists means the PAT might expire before it's first used).

**Why this matters beyond relias-mcp:**

- The phase ladder becomes a Gantt-chartable artifact: features as work blocks, chores as milestones/dependencies.
- A Kanban board can have separate swim lanes for features and chores, with explicit dependency arrows between them.
- Cold-readers (successors, auditors, AOIC if it ever comes to that) can verify at a glance which operational state was reached and which wasn't.
- It surfaces the "I need to do something in GitHub" tax that's invisible in feature-only specs and bites projects in the last 10%.

Future OCS-Ecosystem citizen specs should adopt this division. A spec that lists features without chores is omitting work that's actually required to ship.

---

## 15. Author Note

This spec replaces about 18 months of intermittent manual reconciliation work with about a week of build work, plus 50 minutes of operational setup. The keystone — that the Course Library COPE filter is backed by a clean JSON API — was found in a single afternoon by Claude in Chrome operating on Marty's personal laptop while he was in trainings. The build itself is straightforward Node engineering against a well-defined contract.

The v1.1 update adds the chore-tracking framework on top of v1.0's feature plan. Nothing in the actual code design changed. What changed is visibility — every operational task that has to happen for the build to function is now named, numbered, sequenced, and assigned. A successor inheriting this work doesn't have to reverse-engineer "what did Marty set up where" — the chores doc tells them, and the spec calls out which feature each chore unblocks.

The discipline that makes this work is the same discipline that's run through every spec in this conversation series: paraphrase before acting, lock decisions explicitly, write handoffs the next session can actually read, never trust verbal context from "remember when we discussed X" — write it down or it didn't happen.

The Pacelt-flavored read on this spec: Joe would have built the same thing with a Yahoo Pipes mashup in 2009 and complained about it ever since. He'd be partly right. Most automation is more complicated than the manual workflow it replaces — that's the cost of leverage. Successors who inherit `relias-mcp` will replace one well-documented Node application instead of inheriting Marty's institutional memory of what AOIC's PDFs usually look like. That's the trade.

Goodnight, Marty.

-----
May 26, 2026

OCS — Marty (subject)
OCS-1138 (preparer)

#AI/Claude
