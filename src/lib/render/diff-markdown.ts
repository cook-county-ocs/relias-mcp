import type { ReliasDiff } from '../types.js';

/**
 * Render a {@link ReliasDiff} as a markdown report. Consumed by the F6
 * MCP tool `relias-get-latest-diff` (which emits markdown + structured
 * JSON per tool-output convention).
 *
 * Three sections, in order, each skipped when empty:
 *  1. Summary header (counts + the two timestamps)
 *  2. Added (courses in `to` snapshot but not `from`)
 *  3. Removed (courses in `from` but not `to`)
 *  4. Changed (courses in both with at least one tracked field differing)
 *
 * The Changed section is the one humans care about most — it shows the
 * fields that drifted so a reader doesn't have to diff the snapshots
 * manually.
 */
export function renderDiffMarkdown(diff: ReliasDiff): string {
  const out: string[] = [];

  out.push('# Relias Catalog Diff Report\n');
  out.push(renderSummary(diff));

  if (diff.added.length > 0) {
    out.push('\n## Added courses\n');
    out.push(renderCourseTable(diff.added));
  }
  if (diff.removed.length > 0) {
    out.push('\n## Removed courses\n');
    out.push(renderCourseTable(diff.removed));
  }
  if (diff.changed.length > 0) {
    out.push('\n## Changed courses\n');
    out.push(renderChangedTable(diff));
  }

  return out.join('') + '\n';
}

function renderSummary(diff: ReliasDiff): string {
  return [
    '## Summary\n\n',
    `- From: \`${diff.from.capturedAt}\`\n`,
    `- To:   \`${diff.to.capturedAt}\`\n`,
    `- Added: **${diff.summary.addedCount}**\n`,
    `- Removed: **${diff.summary.removedCount}**\n`,
    `- Changed: **${diff.summary.changedCount}**\n`,
  ].join('');
}

function renderCourseTable(courses: ReliasDiff['added']): string {
  const parts: string[] = ['\n| Code | Title | Hours |\n', '|------|-------|-------|\n'];
  for (const c of courses) {
    parts.push(`| \`${escape(c.code)}\` | ${escape(c.title)} | ${c.hours} |\n`);
  }
  return parts.join('');
}

function renderChangedTable(diff: ReliasDiff): string {
  const parts: string[] = [
    '\n| Code | Title | Changed fields | Before → After |\n',
    '|------|-------|----------------|----------------|\n',
  ];
  for (const change of diff.changed) {
    const fieldList = change.fields.join(', ');
    const beforeAfter = change.fields
      .map((f) => {
        const before = (change.before as unknown as Record<string, unknown>)[f];
        const after = (change.after as unknown as Record<string, unknown>)[f];
        return `${f}: ${escape(String(before))} → ${escape(String(after))}`;
      })
      .join('<br>');
    parts.push(
      `| \`${escape(change.after.code)}\` | ${escape(change.after.title)} | ${fieldList} | ${beforeAfter} |\n`,
    );
  }
  return parts.join('');
}

function escape(s: string): string {
  return s.replace(/\|/g, '\\|');
}
