# F4 Reconciliation Engine — Implementation Plan

**Date:** 2026-05-28
**Author:** OCS — Marty (subject) / Claude Opus 4.7 (preparer)
**Parent spec:** `docs/specs/relias-mcp-v1.0.md` §6 F4
**Sub-spec:** `docs/specs/f4-reconciliation-algorithm.md` (renamed to kebab-case as part of PR-2a opening chore — see §11)
**Status:** resolved 2026-05-28 — all six §3 decisions signed off by Marty in chat; PR-2a in progress

## Changelog

- **2026-05-28 (initial draft).** Six open scope questions surfaced for Marty's decision.
- **2026-05-28 (resolutions).** All six signed off in chat. Decisions captured inline in §3 below.
  - §3.1 audience: deferred per recommendation; evaluate during integration testing.
  - §3.2 null handling: **changed from recommendation.** Marty: "if there is no time or hours or no code, then this should not weigh in the algorithm." Renormalize composite weights over available dimensions instead of returning neutral 0.5. Cleaner math — missing data doesn't penalize or boost, it just doesn't speak.
  - §3.3 use `relias.code`: signed off.
  - §3.4 co-locate tests: signed off ("this is why we plan").
  - §3.5 two PRs: signed off.
  - §3.6 fold PDF regex into PR-2b: **changed from recommendation.** Marty: "regex is magic, and it gets confusing fast" — wants test coverage on the regex co-developed with the engine rather than deferred to PR-3. PR-2b grows to include the regex; PR-3 (real-data integration test only) becomes smaller.

## 1. Purpose

Sub-spec is canonical for the _what_. This plan settles the _how_ — the open implementation questions the sub-spec leaves to judgment, the PR cluster shape, the file layout deviations, and the build order under the paired-work model Marty named in this session ("F4 reconciliation engine — I'll work on the algorithm with Claude Code").

Where this plan and the sub-spec disagree on intent, the sub-spec wins. Where this plan adds detail the sub-spec was silent on, it's the working answer until a follow-on plan supersedes.

## 2. Read This First

The sub-spec is unusually self-contained — it ships pseudocode for every helper, test stubs for every test, a build order, anti-patterns, and tuning-review gates. This plan deliberately does NOT re-state those. It states the gaps, the deviations, and the order in which we'll execute. Read the sub-spec first. Then read this.

The 🎓 marker in the sub-spec says "Marty implements the algorithm itself; Claude Code scaffolds." The paired-coding framing for this session refines that: **Marty owns the design judgment** (weights, thresholds, drift-type taxonomy, calibration decisions); **Claude codes from that direction**. Pure math primitives (Jaro-Winkler, Levenshtein) are reference implementations Claude can write straight; the integration layer (compositeScore, the reconciliation loop, drift classification) is paired interactively with Marty driving the judgment calls.

## 3. Scope Decisions To Settle Before Coding

These are blocking. The plan recommends an answer for each; revise here before the first commit if Marty disagrees.

**§3.1 Audience signal.** The composite weights `audience` at 0.10 but the data shape doesn't exist on either side (`ParsedCatalogEntry` lacks an `audience` field; `ReliasCourse` lacks one; the search-api response wasn't audited for it; the sub-spec doesn't say how parsers should extract X-marks/columns).

**Recommendation: re-weight without audience for v1.0.** New composite: `0.75 * title + 0.15 * hours + 0.10 * code`. Document the deviation prominently. Add audience extraction to v1.1 as a separate feature when the AOIC PDF format knowledge is committed (it lives in your head right now; not in any spec or fixture).

Why not "default audience to empty / always returns neutral 0.5": that adds a dead 0.10 weight to the composite. Better to redistribute it where it actually does work.

**§3.2 Null-handling for code and hours.** `pdf.reliasCode` is `string | null`; `pdf.hours` is `number | null`. The sub-spec specifies `hoursSimilarity(null, anything) → 0.5` (neutral) but is silent on `codeSimilarity(null, anything)`.

**Decision (Marty, 2026-05-28):** when a dimension's data is missing on either side, the dimension does NOT contribute to the composite — composite weights renormalize over the dimensions that DO have data.

So `compositeScore` becomes:

```typescript
function compositeScore(pdf, relias):
  const components = [
    { weight: WEIGHTS.title, score: titleSimilarity(pdf.title, relias.title) },
  ];
  if (pdf.hours !== null && relias.hours !== null) {
    components.push({ weight: WEIGHTS.hours, score: hoursSimilarity(pdf.hours, relias.hours) });
  }
  if (pdf.reliasCode !== null) {
    components.push({ weight: WEIGHTS.code, score: codeSimilarity(pdf.reliasCode, relias.code) });
  }
  const totalWeight = components.reduce((s, c) => s + c.weight, 0);
  const composite = components.reduce((s, c) => s + c.weight * c.score, 0) / totalWeight;
  return { composite, components };
```

The sub-spec's `hoursSimilarity(null, x) → 0.5` (neutral) and the implied `codeSimilarity(null, x) → 0.5` patterns are SUPERSEDED. The similarity helpers themselves don't need to handle null at all — `compositeScore` filters before calling them. Document the decision prominently in `composite-score.ts`.

Why this is better than the original recommendation: a missing dimension contributing 0.5 means "this dimension thinks they're somewhat similar" — which is a lie. Missing data isn't "somewhat similar," it's "can't say." Renormalizing makes the composite reflect only what's known. Title is always present (parsers reject rows with empty title), so the composite is never undefined.

Edge case: title is never null — parsers throw or skip on missing title — so the components array is never empty.

**§3.3 Field naming.** The sub-spec's pseudocode references `relias.courseCode` (the raw search-api field). The `ReliasCourse` type from F2 normalized this to `code`. The composite-score wiring reads `relias.code`, not `relias.courseCode`.

**Recommendation: implementation uses `relias.code`.** The sub-spec naming is drafting drift from the search-api response shape, not a contract.

**§3.4 File layout.** Sub-spec §8 puts tests in `test/fuzzy/` and `test/reconciliation/`. Project convention (and vitest.config.ts) co-locates tests next to source with `include: ['src/**/*.test.ts']`. Spec §8 is inconsistent with project reality.

**Recommendation: deviate from spec §8 — co-locate tests.** Use `src/lib/fuzzy/*.test.ts` and `src/lib/reconciliation/*.test.ts`. Fixtures stay in `test/fixtures/` (matches `test/fixtures/relias-search-response.json` from F2).

**§3.5 PR cluster shape.** Sub-spec §9 lists nine sequential build steps. Each could be a PR (nine PRs) or several could batch (one or two PRs).

**Recommendation: two PRs.**

- **F4 PR-2a — Math primitives.** normalize, levenshtein, jaro-winkler, token-set-ratio, code-parser. Five files + tests. All pure functions. Claude can write the reference implementations from the sub-spec pseudocode; Marty reviews and signs off (light 🎓 — Marty learns by reading clear reference code rather than by typing it).
- **F4 PR-2b — Engine.** Four similarity helpers + composite-score + reconciliation engine + drift classifier + end-to-end fixture test. Marty drives design judgment interactively (paired session); Claude writes the TypeScript from Marty's direction. This is the dense 🎓 PR.

The "or batch them" option exists. Two PRs keeps each review tractable.

**§3.6 End-to-end fixture timing.** Sub-spec §9 step 9 wants a real TY25 PDF + 2026-05-26 snapshot fixture test. The PDF parser body is still scaffolded (`extract-from-text.ts` throws).

**Decision (Marty, 2026-05-28):** fold the PDF regex INTO PR-2b. Rationale: regex is magic and gets confusing fast; co-develop it with the engine and test it vigorously rather than deferring to PR-3.

PR-2b grows accordingly:

- The engine work as originally planned
- `parseCatalogText()` implementation in `src/lib/file-parsers/extract-from-text.ts`
- Heavy test coverage on the regex: per-row extraction cases for every distinct row shape in the TY25 catalog (header row, data row with all 3 fields, data row with X-marks for audience, multi-line title, edge-case formatting), plus negative cases (junk lines, page breaks, headers)
- Real-data E2E test against the actual TY25 PDF fixture (so `aoic-cope-pdf-2025-01-29.pdf` lands in `test/fixtures/` as part of PR-2b)
- The snapshot fixture (`cope-catalog-snapshot-2026-05-26.json`) also lands in PR-2b

PR-3 collapses to either disappearing entirely (its work folded in) or becoming a small follow-on for `docs/plans/F4-fuzzy-match-tuning-review.md` after the first real-data run reveals tuning needs.

## 4. PR-2a — Math Primitives

**Branch:** `F4/fuzzy-primitives`

**Files (all new):**

- `src/lib/fuzzy/normalize.ts` + `normalize.test.ts`
- `src/lib/fuzzy/levenshtein.ts` + `levenshtein.test.ts`
- `src/lib/fuzzy/jaro-winkler.ts` + `jaro-winkler.test.ts`
- `src/lib/fuzzy/token-set-ratio.ts` + `token-set-ratio.test.ts`
- `src/lib/fuzzy/code-parser.ts` + `code-parser.test.ts`
- `src/lib/fuzzy/index.ts` (re-exports)

**Approach for each:** copy reference implementation from the sub-spec pseudocode (it's pseudocode but close to working TypeScript). Tests come from the sub-spec test stubs verbatim; expand where coverage demands.

**Acceptance:**

- 5 files × ~30–60 lines = ~250 LOC source + ~150 LOC tests
- 100% function coverage; 80%+ branch coverage (project threshold)
- All sub-spec test stubs pass
- No new runtime deps (Levenshtein, Jaro-Winkler are pure math; the sub-spec recommended inlining rather than depending on `fastest-levenshtein` or `string-similarity` and I agree)

**Out of scope for PR-2a:**

- The integration layer (similarity helpers, composite, engine) — PR-2b
- Audience handling — deferred per §3.1
- Any reconciliation logic

## 5. PR-2b — Engine

**Branch:** `F4/reconciliation-engine`

**Files (all new unless noted):**

- `src/lib/reconciliation/types.ts` — `ReconciliationResult`, `BothMatch`, `DriftEntry`, `DriftType` enum, `MatchType` enum, `Audience` type (defined but unused in v1.0 — present for v1.1 forward-compatibility)
- `src/lib/reconciliation/similarity.ts` — `titleSimilarity`, `hoursSimilarity`, `codeSimilarity` (the four per spec; audience deferred). One file rather than four because they're 5–15 LOC each.
- `src/lib/reconciliation/similarity.test.ts`
- `src/lib/reconciliation/composite-score.ts` — `compositeScore`, `classifyDrift`, the weight constants
- `src/lib/reconciliation/composite-score.test.ts`
- `src/lib/reconciliation/reconciliation-engine.ts` — `reconcile(parsed, snapshot)` (the three-phase loop)
- `src/lib/reconciliation/reconciliation-engine.test.ts`
- `src/lib/reconciliation/tunable.ts` — exported constants (weights, thresholds, hours-similarity bands) per sub-spec §5
- `src/lib/index.ts` — add exports

**Type additions to `src/lib/types.ts`:**

```typescript
// Re-exported from reconciliation/types.ts for the public library surface.
// Defined in reconciliation/types.ts so the test layout doesn't pull all of
// reconciliation into types.ts.
```

(Plan deliberately doesn't pre-decide where the types live — Marty's call during paired build.)

**Composite weights as code (per §3.1 decision):**

```typescript
// v1.0 — audience deferred. See docs/plans/f4-reconciliation-
// implementation-plan.md §3.1. Restore the 4-component weighting in v1.1
// once audience extraction is built.
export const WEIGHTS = {
  title: 0.75,
  hours: 0.15,
  code: 0.1,
} as const;
```

**Thresholds (per sub-spec):**

```typescript
export const THRESHOLDS = {
  match: 0.85,
  drift: 0.7,
} as const;
```

**The reconcile loop (per sub-spec §4) with §3 adjustments applied:**

- Phase 1: exact code match (skip when pdf.reliasCode is null — falls to Phase 2)
- Phase 2: composite fuzzy match against unclaimed Relias entries
- Phase 3: unclaimed Relias entries → reliasOnly

**Test surface for PR-2b:**

Engine tests (`reconciliation-engine.test.ts`) — minimum cases:

- Empty file → all snapshot courses to reliasOnly, no fileOnly, no drift
- Empty snapshot → all file entries to fileOnly, no inBoth, no drift
- Exact-code-only matches → all inBoth, matchType='exact-code', driftType='identical'
- Pure fuzzy match → benzodiazepines-shaped pair (title drift + hours drift) lands in inBoth with matchType='fuzzy', driftType='multi-field'
- Drift catalog landing → composite 0.70–0.85 entry → driftCatalog, alternates populated, Relias entry NOT claimed
- One-to-one enforcement → two file entries both fuzzy-matching the same Relias entry: highest composite wins, other falls to fileOnly
- Whitespace-only difference → normalize strips it, identical match
- The `0.07h` data-entry-error case from Plan A findings — hoursSimilarity returns 0.0 but title and code might carry → check whether composite still hits 0.70 (and if it does, that's a feature: medium-confidence drift catches the data-entry error)

End-to-end test (`reconciliation-engine.test.ts` separate `describe` block):

- Hand-built `ParsedCatalogEntry[]` mirroring ~5 PDF entries
- Hand-built `ReliasSnapshot` with ~10 courses
- Assert the bucket counts match expectation
- Defer the real-PDF version to PR-3

**Acceptance:**

- All similarity helpers pass their sub-spec test stubs
- Composite-score tests cover identical, single-drift, multi-drift, version-bump cases
- Engine tests cover the cases above
- 100% function coverage; 80%+ branch coverage
- Output JSON shape is stable enough that F5 markdown renderer can consume it without engine changes

## 6. PR-3 — PDF Regex + Real-Data Integration (paired follow-on)

Out of scope for the F4 algorithm plan but flagged because it's the final piece:

- Implement `parseCatalogText()` in `src/lib/file-parsers/extract-from-text.ts` (the function that throws today)
- Commit `test/fixtures/aoic-cope-pdf-2025-01-29.pdf` and `test/fixtures/cope-catalog-snapshot-2026-05-26.json`
- Add the real-data end-to-end test from sub-spec §9 step 9
- Capture review notes in `docs/plans/F4-fuzzy-match-tuning-review.md` per sub-spec §6 (this doc would be a NEW deliverable post first real run — different from this plan)

PR-3 is its own paired session because the regex carries TY25 catalog format-knowledge that lives in Marty's head and needs to be encoded line by line.

## 7. Build Order Within PR-2b (paired session)

Match sub-spec §9 steps 6–8, with the §3 adjustments:

1. **`tunable.ts`** — weights, thresholds, hours-similarity bands. Pure constants. Write first so everything downstream references named constants instead of magic numbers.
2. **`similarity.ts`** — `titleSimilarity`, `hoursSimilarity`, `codeSimilarity`. Test each with sub-spec stubs + null-handling cases. Skip `audienceSimilarity` per §3.1.
3. **`composite-score.ts`** — `compositeScore` integrator + `classifyDrift`. Tests for each drift-type classification path.
4. **`reconciliation-engine.ts`** — the three-phase loop. Tests for the cases listed in §5 above.
5. **`reconciliation/types.ts`** — written incrementally as the above need them; lands consolidated at the end.
6. **`src/lib/index.ts`** — public surface re-exports last so we don't churn it during build.

At each step: write the code, run tests, commit. Six commits on the branch is fine — they preserve the build order in `git log` and rebase-merge keeps them visible on main. (Aligns with the ecosystem rebase-merge convention so each step is a discrete entry in the audit trail.)

## 8. Anti-Patterns To Avoid (reinforced from sub-spec §7)

Re-stating because they're easy to slip into during paired work:

- **Don't reach for a third-party fuzzy library.** `fastest-levenshtein`, `string-similarity`, `fuse.js` all exist. Sub-spec author recommended inlining the math, and the recommendation is correct — fewer surface deps, no version churn, no tree-shaking surprises. Reference implementations are 30–50 LOC each.
- **Don't pre-filter by code prefix.** "Only fuzzy-match within REL-BHC-\*" is wrong (breaks on category drift). Composite score handles it.
- **Don't accumulate booleans.** "title matches AND hours match AND ..." is brittle. Composite + threshold is the design.
- **Don't tune thresholds before real data.** v1.0 values are starting points. Review gates in sub-spec §6 are where they earn their keep. PR-3 produces the first real-data run.
- **Don't add more composite components without removing others.** If we discover release-date proximity matters during PR-3, it replaces a weak existing component (probably `code` if its weight drops with PDF coverage being good enough on its own).

## 9. Acceptance Criteria

F4 is complete (across PR-2a + PR-2b + PR-3) when:

- Math primitives (PR-2a) all pass sub-spec test stubs
- Composite score (PR-2b) produces expected scores for the benzodiazepines/clinical-pathways/unrelated cases in sub-spec §3.2
- Reconciliation engine (PR-2b) produces correct bucket counts on hand-built fixtures
- Real-data end-to-end test (PR-3) produces inBoth/fileOnly/reliasOnly counts that match Marty's Plan A findings (the 33-PDF-entries partial reconciliation referenced in spec §6 F4 Tests)
- `src/lib/index.ts` exports `reconcile`, `ReconciliationResult`, and the weight/threshold tunables for F5 + F6 consumption
- Sub-spec §6 review doc (`docs/plans/F4-fuzzy-match-tuning-review.md`) drafted after PR-3 lands
- 80%+ branch coverage throughout

## 10. Open Items Not Decided Here

These don't block PR-2a but need a decision before PR-2b lands:

- **Q1.** When two file entries both strongly match the same Relias entry (composite > 0.85 each), highest wins and the loser falls to fileOnly. Sub-spec §6 review gate 1 raises this as a question post-real-data. Plan: implement highest-wins for v1.0, capture the data in PR-3's review doc.
- **Q2.** `driftType` enum values. With audience removed, drop `'audience-only'`. Six values left: `'identical'`, `'title-only'`, `'code-only'`, `'hours-only'`, `'multi-field'`, `'version-bump'`. Confirm during paired build.
- **Q3.** Where does the public `Audience` type live? Plan §5 suggests `reconciliation/types.ts` with a comment that it's defined-but-unused in v1.0. Alternative: omit it entirely from v1.0 and add it back in v1.1 with audience extraction. Lean toward "omit" — YAGNI.
- **Q4.** Should `tunable.ts` accept env-var overrides for the weights and thresholds? Sub-spec §5 says "comments documenting why each is set as it is" but doesn't say env-tunable. Lean toward "constants only for v1.0" — the review doc captures intent, and changing weights mid-cron is the kind of thing that should go through a PR, not an env var.

## 11. File-Naming Chore (resolved inline)

The sub-spec file was originally at `docs/specs/F4 — Reconciliation Algorithm Sub-Spec.md` (spaces, em-dash, PascalCase — violates LD-RM-14) AND was never committed to main despite being referenced from the parent spec. Both issues resolved as part of PR-2a's opening chore commit:

- Renamed to `docs/specs/f4-reconciliation-algorithm.md` (kebab-case per LD-RM-14)
- Committed for the first time (the file existed only in Marty's working tree, untracked, since 2026-05-26)

No separate chore PR needed.

## 12. Author Note

The sub-spec is one of the better algorithm docs I've read in this workspace — it's specific about the math, opinionated about the failure modes, and honest in §6 that the thresholds are starting points to be validated. The implementation plan adds the operational layer the sub-spec deliberately doesn't carry: where files go, how PRs split, what to do about the missing audience signal.

The 🎓 spirit is preserved by Marty owning judgment: which weight to redistribute audience's 0.10 to (§3.1 — recommended title, but Marty's call), whether to ship the engine without the PDF real-data test (§3.6 — recommended yes, but Marty's call), whether to env-var-override tunables (§10 Q4 — leaning no, but Marty's call). The TypeScript ergonomics, the Jaro-Winkler reference implementation, the test scaffolds are Claude's lane.

If the algorithm doesn't pass the §6 review gates on the first real-data run (PR-3), that's the system working as intended. The tuning happens after data, not before.

---

May 28, 2026

OCS — Marty (subject)
Claude Opus 4.7 (preparer)

#AI/Claude
