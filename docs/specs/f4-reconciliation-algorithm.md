# F4 — Reconciliation Algorithm Sub-Spec

**Date:** 2026-05-26
**Author:** OCS — Marty (subject, implementer) / OCS-1138 (preparer)
**Audience:** Marty (implementer under 🎓 practice), Claude Code (scaffolding stubs and writing tests)
**Target path on commit:** `docs/spec/f4-reconciliation-algorithm.md`
**Parent spec:** `relias-mcp-v1.0.md` v1.1, §6 F4
**Locked decisions inherited:** LD-RM-08 (PDF/XLSX/CSV/DOCX), LD-RM-09 (TypeScript strict), LD-RM-14 (kebab-case)

---

## 1. Read This First

This is a sub-spec for the reconciliation engine inside F4. It defines the fuzzy-matching algorithm that compares a parsed catalog file (PDF/XLSX/CSV/DOCX) against a Relias snapshot when the Relias code does not match exactly.

This is a 🎓 learning feature. Marty implements the algorithm itself; Claude Code scaffolds the file structure, type definitions, and test harness. Take your time on the implementation — it's small but conceptually rich, and the failure modes are subtle.

---

## 2. Algorithm Overview

```
For each PDF entry without an exact reliasCode match:
  Compute composite similarity against every unclaimed Relias entry.
  Sort candidates by composite score, descending.
  Top candidate:
    composite >= 0.85  →  match (inBoth, with drift annotations if any)
    0.70 <= composite < 0.85  →  drift catalog, medium confidence
    composite < 0.70  →  no match (entry falls to fileOnly)
  If matched, claim the Relias entry (one-to-one, per LD-Q6).
```

The composite score is a weighted average:

```
composite = 0.65 * title_similarity
          + 0.15 * hours_similarity
          + 0.10 * audience_similarity
          + 0.10 * code_similarity
```

Each component is in [0.0, 1.0]. The weights sum to 1.0.

---

## 3. Helper Functions

### 3.1 `normalize(text: string): string`

Produces a canonical form for comparison.

**Steps (in order):**
1. Lowercase.
2. Remove punctuation except hyphens (`-`) and apostrophes inside words (e.g., "don't"). Strip leading/trailing apostrophes.
3. Expand a small set of abbreviations: `pt` → `part`, `&` → `and`, `w/` → `with`.
4. Strip parenthetical "Self-Paced" and "Refresher Course" tags (these are format markers, not content differences).
5. Collapse runs of whitespace to single spaces.
6. Trim.

**Examples:**
| Input | Output |
|---|---|
| `"PREA Pt 1: An Overview"` | `"prea part 1 an overview"` |
| `"Communicating Effectively Self-Paced"` | `"communicating effectively"` |
| `"Cognitive Behavioral Treatment of Substance Use Disorders"` | `"cognitive behavioral treatment of substance use disorders"` |
| `"Abuse, Neglect, and Exploitation"` | `"abuse neglect and exploitation"` |

**Test stub:**
```typescript
describe('normalize', () => {
  it('lowercases', () => expect(normalize('ABC')).toBe('abc'));
  it('strips punctuation', () => expect(normalize('Abuse, Neglect.')).toBe('abuse neglect'));
  it('expands Pt to Part', () => expect(normalize('PREA Pt 1')).toBe('prea part 1'));
  it('strips Self-Paced', () => expect(normalize('Foo Self-Paced')).toBe('foo'));
  it('collapses whitespace', () => expect(normalize('a   b')).toBe('a b'));
});
```

### 3.2 `titleSimilarity(a: string, b: string): number`

**Steps:**
1. `aNorm = normalize(a)`, `bNorm = normalize(b)`.
2. Compute `jaroWinkler(aNorm, bNorm)`.
3. Compute `tokenSetRatio(aNorm, bNorm)`.
4. Return `max(jw, tokenSet)`.

**Library:** Use `fastest-levenshtein` for character-level edit distance and implement Jaro-Winkler + token-set ratio on top of it. Or use `string-similarity` (older, simpler), or `fuse.js` (more featureful but heavier). My recommendation: **implement both functions inline** in `src/lib/fuzzy/`. They're 30–50 lines each and depending on a third-party library for two well-defined math functions is overkill.

**Pseudocode for `jaroWinkler(a, b)`:**

```
function jaroWinkler(a, b):
  jaro = computeJaro(a, b)
  
  if jaro < 0.7:
    return jaro  // no prefix bonus for weak matches
  
  prefix = countCommonPrefix(a, b, max=4)
  return jaro + prefix * 0.1 * (1 - jaro)
```

`computeJaro` is the standard Jaro distance — count matching characters within a window of `max(len(a), len(b)) / 2 - 1`, count transpositions, return `(matches/len(a) + matches/len(b) + (matches - transpositions/2)/matches) / 3`. There are Wikipedia reference implementations in JS; copy one and add tests.

**Pseudocode for `tokenSetRatio(a, b)`:**

```
function tokenSetRatio(a, b):
  setA = new Set(a.split(/\s+/))
  setB = new Set(b.split(/\s+/))
  
  intersection = [...setA].filter(t => setB.has(t)).sort().join(' ')
  diffA = [...setA].filter(t => !setB.has(t)).sort().join(' ')
  diffB = [...setB].filter(t => !setA.has(t)).sort().join(' ')
  
  // Try three string comparisons and take the best
  // (this is the standard rapidfuzz token_set_ratio formulation)
  s1 = intersection
  s2a = intersection + ' ' + diffA
  s2b = intersection + ' ' + diffB
  
  return max(
    levenshteinRatio(s1, s2a),
    levenshteinRatio(s1, s2b),
    levenshteinRatio(s2a, s2b)
  )
```

`levenshteinRatio(a, b) = 1 - (levenshteinDistance(a, b) / max(len(a), len(b)))`.

**Test stub:**
```typescript
describe('titleSimilarity', () => {
  it('returns 1.0 for identical', () => 
    expect(titleSimilarity('foo bar', 'foo bar')).toBe(1.0));
  
  it('returns high for benzodiazepines drift', () => {
    const score = titleSimilarity(
      'Benzodiazepines: Uses, Misuses, and Alternative Treatment Models',
      'Benzodiazepines: Use, Misuse, and Alternative Treatment Methods'
    );
    expect(score).toBeGreaterThan(0.80);
    expect(score).toBeLessThan(0.95);
  });
  
  it('returns very high for clinical pathways drift', () => {
    const score = titleSimilarity(
      'Clinical Pathways that Inform Adolescent Substance Use Disorder',
      'Clinical Pathways Which Inform Adolescent Substance Use Disorder'
    );
    expect(score).toBeGreaterThan(0.90);
  });
  
  it('returns low for unrelated', () => {
    const score = titleSimilarity(
      'Conducting Security Counts in Juvenile Facilities',
      'Marijuana and Cannabinoids: Effects and Potential Medicinal Uses'
    );
    expect(score).toBeLessThan(0.40);
  });
});
```

### 3.3 `hoursSimilarity(a: number | null, b: number | null): number`

Tolerant of drift. Hours change legitimately (Benzodiazepines went from 1.5 to 1.0).

```
function hoursSimilarity(a, b):
  if a == null or b == null: return 0.5  // neutral if one is missing
  diff = abs(a - b)
  if diff == 0: return 1.0
  if diff <= 0.25: return 0.7
  if diff <= 1.0: return 0.3
  return 0.0
```

**Why these specific bands:** A 0.25-hour difference is rounding noise (some PDFs say 1.5, some say 1.50). A 1.0-hour difference is meaningful but recoverable (Benzodiazepines). Larger than that and you're probably looking at a different course (a 0.5h micro-training vs a 3.5h comprehensive series).

**Test stub:**
```typescript
describe('hoursSimilarity', () => {
  it('1.0 for identical', () => expect(hoursSimilarity(1.5, 1.5)).toBe(1.0));
  it('0.7 for tiny drift', () => expect(hoursSimilarity(1.5, 1.25)).toBe(0.7));
  it('0.3 for benzodiazepines drift', () => expect(hoursSimilarity(1.5, 1.0)).toBe(0.3));
  it('0.0 for far apart', () => expect(hoursSimilarity(0.5, 2.5)).toBe(0.0));
  it('0.5 for null on one side', () => expect(hoursSimilarity(1.0, null)).toBe(0.5));
});
```

### 3.4 `audienceSimilarity(a: Audience, b: Audience): number`

Jaccard index over the audience sets.

```typescript
type Audience = { probation: boolean; detention: boolean; management: boolean };

function audienceSimilarity(a, b):
  audA = setOfTrue(a)  // e.g., {'probation', 'management'}
  audB = setOfTrue(b)
  
  if audA.size == 0 and audB.size == 0: return 0.5  // neutral if both empty
  
  intersection = [...audA].filter(t => audB.has(t)).length
  union = new Set([...audA, ...audB]).size
  
  return intersection / union
```

**Examples:**
| A | B | Jaccard |
|---|---|---|
| {P} | {P} | 1.0 |
| {P} | {P, D} | 0.5 |
| {P} | {D} | 0.0 |
| {P, D, M} | {P, D, M} | 1.0 |
| {P, D} | {P, M} | 0.33 |

**Test stub:**
```typescript
describe('audienceSimilarity', () => {
  it('1.0 for identical sets', () => 
    expect(audienceSimilarity({probation: true}, {probation: true})).toBe(1.0));
  it('0.5 for overlap', () => 
    expect(audienceSimilarity({probation: true}, {probation: true, detention: true})).toBe(0.5));
  it('0.0 for disjoint', () => 
    expect(audienceSimilarity({probation: true}, {detention: true})).toBe(0.0));
});
```

### 3.5 `codeSimilarity(a: string, b: string): number`

Parses Relias codes and compares the suffix portion with normalized Levenshtein. Catches the `BUMATM → BUMATMS` pattern from today's findings.

**Code structure:** Relias codes look like `REL-XXX-Y-SUFFIX` or `REL-XXX-SS-SUFFIX` (where SS denotes "supervisory skills"). Special cases: `AOIC-001` (custom AOIC course), `APPA-UIDA-G` (vendor course), `COPE-ShieldofCare` (special COPE course).

**Parse function:**
```typescript
type ParsedCode = {
  prefix: string;        // 'REL', 'AOIC', 'APPA', 'COPE'
  category: string;      // 'BHC', 'PSC', 'PS', 'ALL', 'PAC', etc.
  modifier: string;      // '0', 'SS', 'CFISA', etc.
  suffix: string;        // 'BUMATM', 'ANAE', etc.
  raw: string;
};

function parseCode(code): ParsedCode:
  const parts = code.split('-');
  if (parts.length >= 4 && parts[0] === 'REL'):
    return { prefix: 'REL', category: parts[1], modifier: parts[2], 
             suffix: parts.slice(3).join('-'), raw: code };
  // fall-through for non-REL codes
  return { prefix: parts[0] || '', category: parts[1] || '', 
           modifier: '', suffix: parts.slice(1).join('-'), raw: code };
```

**Similarity:**
```
function codeSimilarity(a, b):
  pa = parseCode(a)
  pb = parseCode(b)
  
  // Quick out: completely different prefix → not related
  if pa.prefix != pb.prefix and pa.prefix != '' and pb.prefix != '':
    return 0.0
  
  // Suffix is the most-changing part; weight it most
  suffixSim = levenshteinRatio(pa.suffix.toLowerCase(), pb.suffix.toLowerCase())
  
  // Category change is meaningful (e.g., PS → PSC) but suffix usually changes with it
  categoryMatch = pa.category === pb.category ? 1.0 : 0.5
  
  return 0.7 * suffixSim + 0.3 * categoryMatch
```

**Test stub:**
```typescript
describe('codeSimilarity', () => {
  it('1.0 for identical', () => 
    expect(codeSimilarity('REL-BHC-0-BUMATM', 'REL-BHC-0-BUMATM')).toBe(1.0));
  
  it('high for BUMATM → BUMATMS', () => {
    const score = codeSimilarity('REL-BHC-0-BUMATM', 'REL-BHC-0-BUMATMS');
    expect(score).toBeGreaterThan(0.85);
  });
  
  it('moderate for category drift PS → PSC', () => {
    const score = codeSimilarity('REL-PS-0-WIP', 'REL-PSC-0-RCTAIC');
    expect(score).toBeLessThan(0.50);  // suffix is very different
    expect(score).toBeGreaterThan(0.10);  // not zero — both REL prefix
  });
  
  it('zero for completely different prefix', () => 
    expect(codeSimilarity('REL-BHC-0-X', 'AOIC-001')).toBe(0.0));
});
```

### 3.6 `compositeScore(pdf, relias): CompositeResult`

The integrator.

```typescript
type CompositeResult = {
  composite: number;        // 0.0 to 1.0
  title: number;
  hours: number;
  audience: number;
  code: number;
  driftType: DriftType | null;  // populated if composite is in match range
};

type DriftType = 'identical' | 'title-only' | 'code-only' | 'hours-only' | 
                  'audience-only' | 'multi-field' | 'version-bump';

function compositeScore(pdf, relias):
  const t = titleSimilarity(pdf.title, relias.title);
  const h = hoursSimilarity(pdf.hours, relias.hours);
  const a = audienceSimilarity(pdf.audience, relias.audience);
  const c = codeSimilarity(pdf.reliasCode, relias.courseCode);
  
  const composite = 0.65 * t + 0.15 * h + 0.10 * a + 0.10 * c;
  
  let driftType = null;
  if (composite >= 0.85):
    driftType = classifyDrift(t, h, a, c, pdf, relias);
  
  return { composite, title: t, hours: h, audience: a, code: c, driftType };

function classifyDrift(t, h, a, c, pdf, relias):
  if t === 1.0 && h === 1.0 && a === 1.0 && c === 1.0: return 'identical';
  
  const titleDrift = t < 1.0;
  const hoursDrift = h < 1.0;
  const audienceDrift = a < 1.0;
  const codeDrift = c < 1.0;
  
  const driftCount = [titleDrift, hoursDrift, audienceDrift, codeDrift]
    .filter(Boolean).length;
  
  if (driftCount === 1):
    if (titleDrift): return 'title-only';
    if (hoursDrift): return 'hours-only';
    if (audienceDrift): return 'audience-only';
    if (codeDrift): return 'code-only';
  
  // Version-bump: code ends in -V2 / -V3 and title differs by one verb tense  
  if (codeDrift && titleDrift && isVersionBump(pdf.reliasCode, relias.courseCode)):
    return 'version-bump';
  
  return 'multi-field';
```

`isVersionBump`: regex on `-V\d+$` in both codes with different version numbers.

---

## 4. The Reconciliation Loop

```typescript
function reconcile(
  parsedEntries: ParsedCatalogEntry[],
  snapshot: ReliasSnapshot
): ReconciliationResult {
  
  const inBoth: BothMatch[] = [];
  const fileOnly: ParsedCatalogEntry[] = [];
  const reliasOnly: ReliasCourse[] = [];
  const driftCatalog: DriftEntry[] = [];
  
  // Phase 1: exact code matches
  const claimedReliasIds = new Set<number>();
  const unmatchedPdf: ParsedCatalogEntry[] = [];
  
  for (const pdf of parsedEntries):
    const exactMatch = snapshot.courses.find(
      r => r.courseCode === pdf.reliasCode
    );
    if (exactMatch):
      inBoth.push({ 
        pdf, 
        relias: exactMatch, 
        composite: 1.0, 
        driftType: 'identical',
        matchType: 'exact-code'
      });
      claimedReliasIds.add(exactMatch.courseID);
    else:
      unmatchedPdf.push(pdf);
  
  // Phase 2: fuzzy match unmatched PDF entries
  for (const pdf of unmatchedPdf):
    const candidates = [];
    
    for (const relias of snapshot.courses):
      if (claimedReliasIds.has(relias.courseID)) continue;
      const result = compositeScore(pdf, relias);
      if (result.composite >= 0.70):  // skip clearly-not candidates
        candidates.push({ relias, ...result });
    
    candidates.sort((a, b) => b.composite - a.composite);
    
    if (candidates.length === 0 || candidates[0].composite < 0.70):
      fileOnly.push(pdf);
      continue;
    
    const top = candidates[0];
    const alternates = candidates.slice(1, 4)  // keep up to 3 alternates
      .map(c => ({ relias: c.relias, composite: c.composite }));
    
    if (top.composite >= 0.85):
      inBoth.push({
        pdf,
        relias: top.relias,
        composite: top.composite,
        driftType: top.driftType,
        matchType: 'fuzzy',
        alternates
      });
      claimedReliasIds.add(top.relias.courseID);
    else:
      // 0.70 <= composite < 0.85 → drift catalog
      driftCatalog.push({
        pdf,
        relias: top.relias,
        composite: top.composite,
        confidence: 'medium',
        breakdown: { title: top.title, hours: top.hours, audience: top.audience, code: top.code },
        alternates
      });
      // Do NOT claim the Relias entry — leave it for the reliasOnly list
      // OR for human review to manually promote
  
  // Phase 3: Relias entries not yet claimed are reliasOnly
  for (const relias of snapshot.courses):
    if (!claimedReliasIds.has(relias.courseID)):
      reliasOnly.push(relias);
  
  return { inBoth, fileOnly, reliasOnly, driftCatalog, summary: ... };
}
```

---

## 5. Tuning Parameters (Future Review)

Per Q4 / Q5 of the design conversation, these are the values flagged for review against real data:

| Parameter | v1.0 value | Review trigger |
|---|---|---|
| Title weight in composite | 0.65 | If too many false positives on hours/audience-similar courses |
| Hours weight | 0.15 | If hours-drifted courses are slipping into reliasOnly |
| Audience weight | 0.10 | If audience-only changes are blocking matches |
| Code weight | 0.10 | If code-drift courses are slipping into reliasOnly |
| Match threshold | 0.85 | If true matches land in drift catalog (raise) or wrong matches land in inBoth (lower) |
| Drift threshold | 0.70 | If too many entries land in drift catalog (raise) or true matches fall to fileOnly (lower) |
| Hours similarity bands | 0/0.25/1.0 | If real-world hour drifts don't fit these bands |
| Jaro-Winkler prefix bonus | 0.1 | Generally stable; revisit if titles with strong prefixes are over-scoring |

Add a `tunable.json` or constants file so these can be adjusted without touching algorithm code. The CI tests will pin to expected values but allow comments documenting why each is set as it is.

---

## 6. Integration Test Review Gates

Per Q6 of the design conversation, after the first real reconciliation run (full TY25 PDF vs current Relias snapshot), review these:

1. **One-to-one vs many-to-many.** Did any Relias course look like the strong match for two different PDF entries? If yes — and there's actually a reasonable interpretation where one Relias course represents what was split into two PDF entries — consider relaxing to many-to-many or producing a "Relias course matches multiple PDF rows" warning.

2. **Threshold calibration.** Of the entries that landed in drift catalog (composite 0.70-0.85), how many did Marty promote to match on review? How many did Marty kill to fileOnly? If most got promoted, raise the match threshold so they pass automatically. If most got killed, lower the match threshold or raise the drift threshold.

3. **Alternate candidates.** When `inBoth` matches have alternates with composite > 0.70, are the alternates ever actually the "right" answer (i.e., the algorithm picked wrong)? If yes, consider re-weighting the components.

4. **Drift type usefulness.** Is the `driftType` enum granular enough? Specifically: do title-only drifts versus version-bump drifts get treated differently downstream? If not, simplify; if yes, expand.

5. **Hours-similarity bands.** Did any real-world hour drifts fall in unexpected places (e.g., a course went from 1.0 to 0.5 — is that "same course, half credit" or "different course"?). Adjust bands.

Document the review in `docs/plan/F4-fuzzy-match-tuning-review.md` after the first full run. Update LD-RM-XX if any thresholds change.

---

## 7. Anti-Patterns to Avoid

These are tempting but wrong; resist them.

- **Don't use a single algorithm if you can take max of two.** Jaro-Winkler alone misses word-shuffles; token-set alone misses character-level typos. Both together cover both.
- **Don't pre-filter by code prefix.** Tempting to say "only fuzzy-match within the same REL-BHC-* family." This breaks when categories shift (PS → PSC). Let the composite score handle it.
- **Don't accumulate boolean checks instead of scoring.** "Title matches AND hours match AND audience matches" is brittle. The composite-score-with-thresholds approach is more flexible and produces sortable output for human review.
- **Don't tune the thresholds before you have real data.** v1.0's values are reasonable defaults from one afternoon's data. Don't tweak them based on synthetic test cases. Wait for the first real run.
- **Don't add more components without removing others.** The four-component composite is already complex enough. If F4 review surfaces a fifth signal (e.g., release-date proximity), consider whether it replaces an existing component rather than adding to the load.

---

## 8. File Layout

```
src/lib/fuzzy/
├── normalize.ts
├── jaro-winkler.ts
├── token-set-ratio.ts
├── levenshtein.ts
├── code-parser.ts
└── index.ts                # re-exports

src/lib/reconciliation/
├── composite-score.ts
├── reconciliation-engine.ts
├── drift-classifier.ts
└── types.ts

test/fuzzy/
├── normalize.test.ts
├── jaro-winkler.test.ts
├── token-set-ratio.test.ts
├── levenshtein.test.ts
└── code-parser.test.ts

test/reconciliation/
├── composite-score.test.ts
├── reconciliation-engine.test.ts
└── fixtures/
    ├── benzodiazepines-drift.json
    ├── clinical-pathways-drift.json
    ├── version-bump.json
    └── full-ty25-vs-snapshot.json
```

---

## 9. Implementation Order (Marty's path)

Build in this order; each step has a working test before moving to the next.

1. **`normalize.ts` + tests.** Smallest function; gets you comfortable with the test harness.
2. **`levenshtein.ts` + tests.** Pure math; copy a reference implementation, add tests.
3. **`jaro-winkler.ts` + tests.** Builds on Levenshtein conceptually but is independent code.
4. **`token-set-ratio.ts` + tests.** Composes Levenshtein.
5. **`code-parser.ts` + tests.** Pure regex / string work.
6. **Helper functions: `titleSimilarity`, `hoursSimilarity`, `audienceSimilarity`, `codeSimilarity`** + tests for each.
7. **`composite-score.ts` + tests.** The integrator.
8. **`reconciliation-engine.ts` + tests.** The loop, claims tracking, drift catalog assembly.
9. **End-to-end fixture test.** Run the full TY25 PDF against today's snapshot fixture; verify the inBoth/fileOnly/reliasOnly counts match expectations from the Plan A findings.

Each step is reviewable as its own PR under the 5% practice. Plan for 9 small PRs across F4, or batch them — your call when you get there.

---

## 10. Author Note

Fuzzy matching is one of those topics where the math is well-established (Jaro 1989, Winkler 1990, Levenshtein 1965) but the application is judgment. Two researchers using the same algorithm on the same data will reach different thresholds because they care about different failure modes.

The weights and thresholds in this spec are starting points, not gospel. The integration review gates (§6) are where they earn their keep. After the first real run, you'll have actual data on how many courses fell in each bucket, and you'll know whether 0.85 is the right number for our domain or whether the AOIC catalog is messier than I'm expecting.

The Pacelt-flavored read on this sub-spec: the King of the Slams would have looked at two course names by eye, said "those are obviously the same course," and been right 95% of the time without ever defining a threshold. He'd also have been wrong 5% of the time without ever knowing it, and the wrong ones would have been the cases where it mattered most. The algorithm doesn't beat Joe at the easy cases. It beats Joe at the hard cases — the ones where two courses look similar and aren't, or look different and are. Successors inheriting this code don't have to develop Joe's intuition; the algorithm encodes it.

Goodnight, Marty.

-----
May 26, 2026

OCS — Marty (subject, implementer)
OCS-1138 (preparer)

#AI/Claude
