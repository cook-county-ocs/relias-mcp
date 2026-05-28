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
 * - `--json`: emit the command result as structured JSON on stdout.
 *
 * **Logs always go to stderr.** Standard CLI hygiene: machine output on
 * stdout, diagnostics on stderr. Without this split, `--json` output
 * gets interleaved with pino log lines and downstream `jq`/parsers
 * choke (the CLI's own JSON would be a single document, but pino emits
 * multiple JSON-line documents in between — invalid as a stream of one
 * value). The cron's notification step gets logs via 2>&1 redirection
 * when it wants them.
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
  // process.stderr as destination — pino accepts any Writable. Stays
  // synchronous (fine for a short-lived CLI; cron doesn't care).
  return pino(baseOptions, process.stderr);
}
