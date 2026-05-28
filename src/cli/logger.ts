import { pino, type Logger } from 'pino';

/**
 * Pino logger setup for the CLI, with `--verbose` / `--quiet` / `--json`
 * controls per spec §6 F5.
 *
 * - `--verbose`: pino at `debug` level. Everything down to "computing
 *   composite score" gets emitted. Useful for tuning + cron debugging.
 * - `--quiet`: pino at `error` level. Only failures emit. Useful for
 *   piping to other tools.
 * - default: `info` level. Headline progress + summary stats emit.
 * - `--json`: switch transport from pretty to raw JSON for machine
 *   consumers (the cron's notification step parses these lines).
 *
 * Secret redaction is always on (per F1's pino setup convention) — the
 * OIDC access/refresh/id tokens never appear in CLI output regardless
 * of verbosity.
 */

export interface LoggerOptions {
  verbose?: boolean;
  quiet?: boolean;
  json?: boolean;
}

export function createCliLogger(opts: LoggerOptions = {}): Logger {
  const level = opts.verbose ? 'debug' : opts.quiet ? 'error' : 'info';
  const baseOptions = {
    level,
    redact: {
      paths: ['access_token', 'refresh_token', 'id_token', '*.accessToken', '*.refreshToken'],
      remove: true,
    },
  };
  // Default to JSON-line output (pino's native format) — universally
  // parseable by the cron's notification step and by humans on
  // narrow terminals. --json explicitly opts in to that same format.
  // For interactive sessions a future enhancement could swap to
  // pino-pretty, but adding the transport dep isn't worth it for v1.0.
  return pino(baseOptions);
}
