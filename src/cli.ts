#!/usr/bin/env node
/**
 * relias-mcp CLI entry point (F5 per spec).
 *
 * Four commands wrapping the F1–F4 library:
 *  - snapshot:  pull catalog, save snapshot, save diff vs previous (cron uses this)
 *  - reconcile: parse a file, reconcile against latest snapshot, render markdown
 *  - diff:      print latest saved diff, or compute on-the-fly between two snapshots
 *  - doctor:    pre-flight env + reachability checks
 *
 * Global options: --verbose, --quiet, --json. JSON output is always
 * structured; markdown output (reconcile) is the human-friendly default.
 *
 * Exit codes:
 *  0  success
 *  1  generic error / doctor failed
 *  2  schema drift (from F2)
 *  3  unsupported file extension (from F4)
 *  4  missing env var
 *  5  no snapshot to reconcile against
 *  6  diff not found
 */
import { writeFile } from 'node:fs/promises';

import { Command } from 'commander';

import { PACKAGE_NAME } from './lib/index.js';
import { runDiff } from './cli/commands/diff.js';
import { runDoctor, type DoctorReport } from './cli/commands/doctor.js';
import { runReconcile } from './cli/commands/reconcile.js';
import { runSnapshot } from './cli/commands/snapshot.js';
import { createDefaultContext, type CliContext } from './cli/context.js';
import { createCliLogger } from './cli/logger.js';

export interface CliRunOptions {
  /** argv array (matches process.argv shape: includes node + script). Used by tests. */
  argv?: string[];
  /** Override stdout/stderr writers (used by tests to capture output). */
  stdout?: (s: string) => void;
  stderr?: (s: string) => void;
  /** Override context factory — tests inject a fully-mocked CliContext. */
  contextFactory?: (mode: 'snapshot' | 'readonly') => CliContext;
}

export async function runCli(opts: CliRunOptions = {}): Promise<number> {
  const stdout = opts.stdout ?? ((s: string) => process.stdout.write(s));
  const stderr = opts.stderr ?? ((s: string) => process.stderr.write(s));

  const program = new Command();
  program
    .name('relias-mcp')
    .description('Reconcile AOIC COPE catalog files against the Relias course library')
    .option('-v, --verbose', 'verbose logging (debug level)')
    .option('-q, --quiet', 'quiet logging (errors only)')
    .option('--json', 'machine-readable JSON output');

  let exitCode = 0;

  function buildContext(mode: 'snapshot' | 'readonly'): CliContext {
    const g = program.opts() as { verbose?: boolean; quiet?: boolean; json?: boolean };
    const logger = createCliLogger({ verbose: g.verbose, quiet: g.quiet, json: g.json });
    return opts.contextFactory ? opts.contextFactory(mode) : createDefaultContext(logger, mode);
  }

  program
    .command('snapshot')
    .description('Pull catalog, save snapshot + diff vs previous')
    .action(async () => {
      try {
        const ctx = buildContext('snapshot');
        const result = await runSnapshot(ctx);
        if ((program.opts() as { json?: boolean }).json) {
          stdout(JSON.stringify(result, null, 2) + '\n');
        } else {
          stdout(
            `Saved snapshot: ${result.snapshot.path} (${result.snapshot.totalCount} courses)\n`,
          );
          if (result.diff !== null) {
            stdout(
              `Diff: +${result.diff.summary.addedCount} -${result.diff.summary.removedCount} ~${result.diff.summary.changedCount}\n`,
            );
          } else {
            stdout('First snapshot — no diff.\n');
          }
        }
      } catch (err) {
        exitCode = handleError(err, stderr);
      }
    });

  program
    .command('reconcile <file>')
    .description('Parse a coordinator file and reconcile against the latest snapshot')
    .option('-o, --output <path>', 'write report to a file instead of stdout')
    .action(async (file: string, cmdOpts: { output?: string }) => {
      try {
        const ctx = buildContext('readonly');
        const payload = await runReconcile(ctx, file);
        const out = (program.opts() as { json?: boolean }).json
          ? JSON.stringify(payload.result, null, 2) + '\n'
          : payload.markdown;
        if (cmdOpts.output) {
          await writeFile(cmdOpts.output, out);
          stdout(`Wrote report to ${cmdOpts.output}\n`);
        } else {
          stdout(out);
        }
      } catch (err) {
        exitCode = handleError(err, stderr);
      }
    });

  program
    .command('diff')
    .description('Print the latest saved diff, or compute on-the-fly between two snapshots')
    .option('--from <iso>', 'starting snapshot capturedAt (ISO8601 UTC)')
    .option('--to <iso>', 'ending snapshot capturedAt (ISO8601 UTC)')
    .action(async (cmdOpts: { from?: string; to?: string }) => {
      try {
        const ctx = buildContext('readonly');
        const payload = await runDiff(ctx, cmdOpts);
        if ((program.opts() as { json?: boolean }).json) {
          stdout(JSON.stringify(payload, null, 2) + '\n');
        } else {
          const d = payload.diff;
          stdout(`Diff: ${d.from.capturedAt} → ${d.to.capturedAt}\n`);
          stdout(
            `  +${d.summary.addedCount} added, -${d.summary.removedCount} removed, ~${d.summary.changedCount} changed\n`,
          );
        }
      } catch (err) {
        exitCode = handleError(err, stderr);
      }
    });

  program
    .command('doctor')
    .description('Pre-flight: env vars, IdP reachable, snapshots repo reachable, parsers loadable')
    .action(async () => {
      try {
        // 'readonly' so doctor inspects env directly and reports missing
        // as soft failures rather than hard-erroring during build.
        const ctx = buildContext('readonly');
        const report = await runDoctor(ctx);
        if ((program.opts() as { json?: boolean }).json) {
          stdout(JSON.stringify(report, null, 2) + '\n');
        } else {
          stdout(renderDoctorTextReport(report));
        }
        if (!report.healthy) exitCode = 1;
      } catch (err) {
        exitCode = handleError(err, stderr);
      }
    });

  await program.parseAsync(opts.argv ?? process.argv);
  return exitCode;
}

function handleError(err: unknown, stderr: (s: string) => void): number {
  const e = err as { exitCode?: number; message?: string };
  const code = typeof e.exitCode === 'number' ? e.exitCode : 1;
  stderr(`${PACKAGE_NAME}: ${e.message ?? String(err)}\n`);
  return code;
}

function renderDoctorTextReport(report: DoctorReport): string {
  const lines: string[] = [];
  lines.push(`Doctor report — overall: ${report.healthy ? 'HEALTHY' : 'UNHEALTHY'}\n`);
  lines.push('\nEnvironment variables:\n');
  for (const e of report.envStatus) {
    const marker = e.set ? '✓' : e.required ? '✗' : ' ';
    const tag = e.required ? '(required)' : '(optional)';
    lines.push(`  [${marker}] ${e.variable} ${tag}\n`);
  }
  lines.push('\nChecks:\n');
  for (const c of report.checks) {
    lines.push(`  [${c.ok ? '✓' : '✗'}] ${c.name}: ${c.detail}\n`);
  }
  return lines.join('');
}

// Top-level execution guard so this file can be imported by tests without
// running. Match the script URL against import.meta.url — works under
// node's native ESM loader.
const isMain = (() => {
  try {
    const scriptUrl = new URL(`file://${process.argv[1]}`).href;
    return import.meta.url === scriptUrl;
  } catch {
    return false;
  }
})();

if (isMain) {
  runCli()
    .then((code) => process.exit(code))
    .catch((err: unknown) => {
      process.stderr.write(`${PACKAGE_NAME}: fatal: ${String(err)}\n`);
      process.exit(1);
    });
}
