import { parserForExtension } from '../../lib/file-parsers/index.js';
import type { CliContext } from '../context.js';
import { inspectEnv, type EnvStatus } from '../env.js';

/**
 * `relias-mcp doctor` — pre-flight health check per spec §6 F5. Verifies:
 *  - Required env vars are set (without throwing)
 *  - IdP reachable + refresh token still valid (calls OidcAuth.getAccessToken)
 *  - Snapshots repo reachable (calls store.list with limit=1)
 *  - All four parsers loadable (calls parserForExtension on each extension)
 *
 * Each check runs independently — a failure in one doesn't abort the
 * others. The report shows what's healthy and what isn't so the operator
 * sees the full picture in one run.
 *
 * Exit 0 if every check passes; exit 1 if any fail. The cron's
 * notification step can parse the `--json` output to alert on specific
 * failure categories.
 */

export interface DoctorCheck {
  name: string;
  ok: boolean;
  detail: string;
}

export interface DoctorReport {
  envStatus: EnvStatus[];
  checks: DoctorCheck[];
  /** True when EVERY check passed (and all required env vars are set). */
  healthy: boolean;
}

export async function runDoctor(ctx: CliContext): Promise<DoctorReport> {
  const logger = ctx.logger;
  const envStatus = inspectEnv();
  const checks: DoctorCheck[] = [];

  // --- env vars ---
  const missingRequired = envStatus.filter((e) => e.required && !e.set);
  checks.push({
    name: 'env',
    ok: missingRequired.length === 0,
    detail:
      missingRequired.length === 0
        ? 'all required env vars set'
        : `missing: ${missingRequired.map((e) => e.variable).join(', ')}`,
  });

  // --- IdP reachable + token valid ---
  // Only attempt if the required env var is set — otherwise the build
  // step would throw with a less useful message.
  if (envStatus.find((e) => e.variable === 'RELIAS_OIDC_REFRESH_TOKEN')?.set === true) {
    checks.push(
      await tryCheck('idp', async () => {
        const oidc = ctx.buildOidc();
        const token = await oidc.getAccessToken();
        return `IdP reachable; access token acquired (length=${token.length})`;
      }),
    );
  } else {
    checks.push({ name: 'idp', ok: false, detail: 'skipped — RELIAS_OIDC_REFRESH_TOKEN not set' });
  }

  // --- snapshots repo reachable ---
  if (envStatus.find((e) => e.variable === 'RELIAS_SNAPSHOTS_REMOTE')?.set === true) {
    checks.push(
      await tryCheck('snapshots-repo', async () => {
        const store = ctx.buildStore();
        const metas = await store.list({ limit: 1 });
        return `repo reachable; ${metas.length} snapshot${metas.length === 1 ? '' : 's'} present`;
      }),
    );
  } else {
    checks.push({
      name: 'snapshots-repo',
      ok: false,
      detail: 'skipped — RELIAS_SNAPSHOTS_REMOTE not set',
    });
  }

  // --- parsers loadable ---
  checks.push(
    tryCheckSync('parsers', () => {
      const extensions = ['.pdf', '.xlsx', '.csv', '.docx'];
      for (const ext of extensions) parserForExtension(ext);
      return `all 4 parsers (${extensions.join(', ')}) loadable`;
    }),
  );

  const healthy = checks.every((c) => c.ok);
  logger.info({ healthy, checks: checks.length }, 'doctor: complete');

  return { envStatus, checks, healthy };
}

async function tryCheck(name: string, fn: () => Promise<string>): Promise<DoctorCheck> {
  try {
    const detail = await fn();
    return { name, ok: true, detail };
  } catch (err) {
    return { name, ok: false, detail: err instanceof Error ? err.message : String(err) };
  }
}

function tryCheckSync(name: string, fn: () => string): DoctorCheck {
  try {
    const detail = fn();
    return { name, ok: true, detail };
  } catch (err) {
    return { name, ok: false, detail: err instanceof Error ? err.message : String(err) };
  }
}
