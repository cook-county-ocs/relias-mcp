import type { ParsedCatalogEntry, ReliasCourse, ReliasSnapshot } from '../types.js';

import { classifyDrift, compositeScore, type CompositeBreakdown } from './composite-score.js';
import { MAX_ALTERNATES, THRESHOLDS } from './tunable.js';
import type { AlternateCandidate, BothMatch, DriftEntry, ReconciliationResult } from './types.js';

/**
 * Compare a parsed catalog file (PDF/XLSX/CSV/DOCX) against a Relias
 * snapshot — the heart of the F4 reconciliation engine.
 *
 * Per `docs/specs/f4-reconciliation-algorithm.md §4` (the three-phase
 * loop) with the implementation plan §3.2 renormalize-on-missing
 * behavior baked into `compositeScore`.
 *
 * Three phases:
 *
 * 1. **Exact code match.** For each PDF entry that carries a non-null
 *    `reliasCode`, look for the same `code` in the snapshot. On hit:
 *    push to `inBoth` with `matchType: 'exact-code'`, claim the Relias
 *    entry, skip Phase 2.
 *
 * 2. **Fuzzy match.** For each PDF entry not exact-matched: compute
 *    composite score against every unclaimed Relias entry. Sort
 *    candidates by composite descending. Top candidate decides:
 *      - composite >= match threshold (0.85) → `inBoth`, claim Relias.
 *      - composite >= drift threshold (0.70) → `driftCatalog`, do NOT
 *        claim Relias (it stays available for another PDF entry to
 *        match, OR falls to reliasOnly in Phase 3).
 *      - composite < drift threshold → `fileOnly`.
 *    Both `inBoth` and `driftCatalog` carry up to 3 alternate candidates
 *    (composite ≥ drift threshold) for human review.
 *
 * 3. **Remainder.** Unclaimed Relias courses → `reliasOnly`.
 *
 * One-to-one matching: a Relias course is claimed by at most one PDF
 * entry. If two PDF entries strongly match the same Relias, the higher-
 * composite wins; the loser falls through to fileOnly or driftCatalog
 * depending on its next-best candidate. Sub-spec §6 review gate 1 raises
 * this for revisit after first real-data run.
 *
 * Determinism: PDF entries are processed in input order. When two
 * candidates tie on composite, the first encountered wins (Map insertion
 * order on the snapshot's `courses` array). This makes the function
 * pure — same inputs → same output.
 */
export function reconcile(
  parsedEntries: ParsedCatalogEntry[],
  snapshot: ReliasSnapshot,
): ReconciliationResult {
  const inBoth: BothMatch[] = [];
  const fileOnly: ParsedCatalogEntry[] = [];
  const driftCatalog: DriftEntry[] = [];
  const claimedReliasIds = new Set<number>();

  // --- Phase 1: exact code match ----------------------------------------
  const codeToRelias = new Map<string, ReliasCourse>();
  for (const course of snapshot.courses) {
    codeToRelias.set(course.code, course);
  }

  const unmatchedPdf: ParsedCatalogEntry[] = [];
  for (const entry of parsedEntries) {
    if (entry.reliasCode === null) {
      unmatchedPdf.push(entry);
      continue;
    }
    const exact = codeToRelias.get(entry.reliasCode);
    if (exact && !claimedReliasIds.has(exact.courseID)) {
      inBoth.push({
        pdf: entry,
        relias: exact,
        composite: 1.0,
        matchType: 'exact-code',
        driftType: 'identical',
        alternates: [],
      });
      claimedReliasIds.add(exact.courseID);
    } else {
      unmatchedPdf.push(entry);
    }
  }

  // --- Phase 2: fuzzy match ---------------------------------------------
  for (const entry of unmatchedPdf) {
    const candidates: Array<{ relias: ReliasCourse; breakdown: CompositeBreakdown }> = [];
    for (const course of snapshot.courses) {
      if (claimedReliasIds.has(course.courseID)) continue;
      const breakdown = compositeScore(entry, course);
      if (breakdown.composite >= THRESHOLDS.drift) {
        candidates.push({ relias: course, breakdown });
      }
    }
    candidates.sort((a, b) => b.breakdown.composite - a.breakdown.composite);

    if (candidates.length === 0) {
      fileOnly.push(entry);
      continue;
    }

    const top = candidates[0]!;
    const alternates: AlternateCandidate[] = candidates
      .slice(1, 1 + MAX_ALTERNATES)
      .map((c) => ({ relias: c.relias, composite: c.breakdown.composite }));

    if (top.breakdown.composite >= THRESHOLDS.match) {
      const driftType = classifyDrift(entry, top.relias, top.breakdown);
      inBoth.push({
        pdf: entry,
        relias: top.relias,
        composite: top.breakdown.composite,
        matchType: 'fuzzy',
        driftType,
        alternates,
        breakdown: top.breakdown,
      });
      claimedReliasIds.add(top.relias.courseID);
    } else {
      // drift band — record but do not claim
      driftCatalog.push({
        pdf: entry,
        relias: top.relias,
        composite: top.breakdown.composite,
        confidence: 'medium',
        breakdown: top.breakdown,
        alternates,
      });
    }
  }

  // --- Phase 3: remainder ------------------------------------------------
  const reliasOnly: ReliasCourse[] = [];
  for (const course of snapshot.courses) {
    if (!claimedReliasIds.has(course.courseID)) reliasOnly.push(course);
  }

  const exactCodeMatches = inBoth.filter((m) => m.matchType === 'exact-code').length;
  const fuzzyMatches = inBoth.filter((m) => m.matchType === 'fuzzy').length;

  return {
    inBoth,
    fileOnly,
    reliasOnly,
    driftCatalog,
    summary: {
      fileTotal: parsedEntries.length,
      reliasTotal: snapshot.courses.length,
      exactCodeMatches,
      fuzzyMatches,
      driftCatalogCount: driftCatalog.length,
      fileOnlyCount: fileOnly.length,
      reliasOnlyCount: reliasOnly.length,
    },
  };
}
