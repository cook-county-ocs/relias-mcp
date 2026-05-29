import type {
  AlternateCandidate,
  BothMatch,
  DriftEntry,
  ReconciliationResult,
} from '../reconciliation/index.js';

/**
 * Render a {@link ReconciliationResult} as a markdown report — same
 * shape as the Plan A discovery deliverable (per relias-mcp-v1.0.md
 * §6 F5 implementation notes). Consumed by both `relias-mcp reconcile`
 * (default output) and the F6 MCP `relias-reconcile-catalog` tool.
 *
 * Sections, in order:
 *  1. Summary header: bucket counts at a glance.
 *  2. **In Both** — matched courses, split into exact-code (no drift) and
 *     fuzzy (with drift annotations). Skipped if empty.
 *  3. **Drift Catalog** — medium-confidence near-misses for human review.
 *     Skipped if empty.
 *  4. **File Only** — coordinator file rows with no Relias counterpart.
 *  5. **Relias Only** — Relias courses absent from the coordinator file.
 *
 * Sections with zero entries are omitted entirely (rather than emitted
 * with "(none)") to keep the report short for the common case of
 * mostly-clean reconciliations.
 */
export function renderReconciliationMarkdown(result: ReconciliationResult): string {
  const out: string[] = [];

  out.push('# Relias Catalog Reconciliation Report\n');
  out.push(renderSummary(result));

  if (result.inBoth.length > 0) {
    out.push('\n## In Both\n');
    out.push(renderInBoth(result.inBoth));
  }

  if (result.driftCatalog.length > 0) {
    out.push('\n## Drift Catalog (medium confidence — review)\n');
    out.push(renderDriftCatalog(result.driftCatalog));
  }

  if (result.fileOnly.length > 0) {
    out.push('\n## File Only — present in file, not in Relias\n');
    out.push(renderFileOnly(result.fileOnly));
  }

  if (result.reliasOnly.length > 0) {
    out.push('\n## Relias Only — present in Relias, not in file\n');
    out.push(renderReliasOnly(result.reliasOnly));
  }

  return out.join('') + '\n';
}

function renderSummary(result: ReconciliationResult): string {
  const s = result.summary;
  return [
    '## Summary\n',
    '\n',
    `- File entries: **${s.fileTotal}**\n`,
    `- Relias courses: **${s.reliasTotal}**\n`,
    `- In both (exact-code matches): **${s.exactCodeMatches}**\n`,
    `- In both (fuzzy matches): **${s.fuzzyMatches}**\n`,
    `- Drift catalog (needs review): **${s.driftCatalogCount}**\n`,
    `- File only: **${s.fileOnlyCount}**\n`,
    `- Relias only: **${s.reliasOnlyCount}**\n`,
  ].join('');
}

function renderInBoth(matches: BothMatch[]): string {
  // Group by matchType so the noisy fuzzy section is separate from the
  // tidy exact-code section.
  const exact = matches.filter((m) => m.matchType === 'exact-code');
  const fuzzy = matches.filter((m) => m.matchType === 'fuzzy');

  const parts: string[] = [];

  if (exact.length > 0) {
    parts.push('\n### Exact-code matches\n\n');
    parts.push('| Code | Title | Hours |\n');
    parts.push('|------|-------|-------|\n');
    for (const m of exact) {
      parts.push(
        `| \`${escape(m.relias.code)}\` | ${escape(m.relias.title)} | ${m.relias.hours} |\n`,
      );
    }
  }

  if (fuzzy.length > 0) {
    parts.push('\n### Fuzzy matches (with drift)\n\n');
    parts.push('| File Code | Relias Code | Composite | Drift | Title (file → Relias) |\n');
    parts.push('|-----------|-------------|-----------|-------|-----------------------|\n');
    for (const m of fuzzy) {
      const fileCode = m.pdf.reliasCode ?? '_none_';
      const sameTitle = m.pdf.title === m.relias.title;
      const titleCell = sameTitle
        ? escape(m.pdf.title)
        : `${escape(m.pdf.title)} → ${escape(m.relias.title)}`;
      parts.push(
        `| \`${escape(fileCode)}\` | \`${escape(m.relias.code)}\` | ${m.composite.toFixed(3)} | ${m.driftType} | ${titleCell} |\n`,
      );
      if (m.alternates.length > 0) parts.push(renderAlternates(m.alternates));
    }
  }

  return parts.join('');
}

function renderDriftCatalog(entries: DriftEntry[]): string {
  const parts: string[] = [
    '\nMedium-confidence matches (composite 0.70–0.85). The Relias entry was NOT claimed — promote to a match manually if correct, or leave as separate file-only + relias-only rows.\n\n',
    '| File Title | File Code | Relias Title | Relias Code | Composite |\n',
    '|------------|-----------|--------------|-------------|----------|\n',
  ];
  for (const e of entries) {
    parts.push(
      `| ${escape(e.pdf.title)} | \`${escape(e.pdf.reliasCode ?? '_none_')}\` | ${escape(e.relias.title)} | \`${escape(e.relias.code)}\` | ${e.composite.toFixed(3)} |\n`,
    );
    if (e.alternates.length > 0) parts.push(renderAlternates(e.alternates));
  }
  return parts.join('');
}

function renderAlternates(alts: AlternateCandidate[]): string {
  const parts: string[] = ['\n  _Alternates considered:_\n'];
  for (const a of alts) {
    parts.push(
      `  - \`${escape(a.relias.code)}\` ${escape(a.relias.title)} (${a.composite.toFixed(3)})\n`,
    );
  }
  return parts.join('') + '\n';
}

function renderFileOnly(entries: ReconciliationResult['fileOnly']): string {
  const parts: string[] = [
    '\n| Title | Code (from file) | Hours |\n',
    '|-------|------------------|-------|\n',
  ];
  for (const e of entries) {
    parts.push(
      `| ${escape(e.title)} | \`${escape(e.reliasCode ?? '_none_')}\` | ${e.hours ?? '_n/a_'} |\n`,
    );
  }
  return parts.join('');
}

function renderReliasOnly(courses: ReconciliationResult['reliasOnly']): string {
  const parts: string[] = ['\n| Code | Title | Hours |\n', '|------|-------|-------|\n'];
  for (const c of courses) {
    parts.push(`| \`${escape(c.code)}\` | ${escape(c.title)} | ${c.hours} |\n`);
  }
  return parts.join('');
}

/** Escape pipe characters so they don't break markdown tables. */
function escape(s: string): string {
  return s.replace(/\|/g, '\\|');
}
