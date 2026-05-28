/**
 * Environment-variable resolution + validation for the CLI.
 *
 * Per CLAUDE.md (SCREAMING_SNAKE_CASE, Unix convention). Each command
 * declares which env vars it needs by calling `resolveEnv()` with the
 * relevant requirement set; missing required vars surface as a structured
 * error that the CLI maps to exit code 4 and a human-readable message.
 *
 * The doctor command inspects env vars directly via `inspectEnv()` to
 * report which are set vs missing, without forcing construction of the
 * dependent subsystems.
 */

/** Required + optional environment variables consumed by the CLI. */
export interface EnvSpec {
  /** Initial OIDC refresh token (chore C8). Required for snapshot + doctor IdP-check. */
  RELIAS_OIDC_REFRESH_TOKEN?: string;
  /** Snapshots repo remote URL (SSH form for production). Required for snapshot + diff + doctor. */
  RELIAS_SNAPSHOTS_REMOTE?: string;
  /** Local clone path for the snapshots repo. Defaults to a tmp dir if unset. */
  RELIAS_SNAPSHOTS_LOCAL?: string;
  /** Branch to push to. Defaults to `main`. */
  RELIAS_SNAPSHOTS_BRANCH?: string;
}

/** What `inspectEnv()` returns — used by the doctor command's report. */
export interface EnvStatus {
  variable: keyof EnvSpec;
  set: boolean;
  required: boolean;
}

/** Variable → required-for-snapshot mapping. Used by both resolve + inspect paths. */
const REQUIRED_FOR_SNAPSHOT: ReadonlyArray<keyof EnvSpec> = [
  'RELIAS_OIDC_REFRESH_TOKEN',
  'RELIAS_SNAPSHOTS_REMOTE',
];

/** Required-for-readonly-ops (reconcile/diff). Just the snapshots repo. */
const REQUIRED_FOR_READONLY: ReadonlyArray<keyof EnvSpec> = ['RELIAS_SNAPSHOTS_REMOTE'];

/**
 * Resolve env vars and validate that the required ones for a given mode
 * are present. Throws `MissingEnvError` listing missing vars on failure.
 */
export function resolveEnv(mode: 'snapshot' | 'readonly', source: EnvSpec = process.env): EnvSpec {
  const required = mode === 'snapshot' ? REQUIRED_FOR_SNAPSHOT : REQUIRED_FOR_READONLY;
  const missing = required.filter((k) => !source[k] || source[k]?.trim() === '');
  if (missing.length > 0) {
    throw new MissingEnvError(missing);
  }
  return {
    RELIAS_OIDC_REFRESH_TOKEN: source.RELIAS_OIDC_REFRESH_TOKEN,
    RELIAS_SNAPSHOTS_REMOTE: source.RELIAS_SNAPSHOTS_REMOTE,
    RELIAS_SNAPSHOTS_LOCAL: source.RELIAS_SNAPSHOTS_LOCAL,
    RELIAS_SNAPSHOTS_BRANCH: source.RELIAS_SNAPSHOTS_BRANCH,
  };
}

/**
 * Inspect all known env vars and report whether each is set. Used by
 * the doctor command without throwing — the report includes both set
 * and missing vars so the human reading the output can see the full
 * picture.
 */
export function inspectEnv(source: EnvSpec = process.env): EnvStatus[] {
  const all: Array<keyof EnvSpec> = [
    'RELIAS_OIDC_REFRESH_TOKEN',
    'RELIAS_SNAPSHOTS_REMOTE',
    'RELIAS_SNAPSHOTS_LOCAL',
    'RELIAS_SNAPSHOTS_BRANCH',
  ];
  return all.map((variable) => ({
    variable,
    set: Boolean(source[variable] && source[variable]?.trim() !== ''),
    required: REQUIRED_FOR_SNAPSHOT.includes(variable) || REQUIRED_FOR_READONLY.includes(variable),
  }));
}

export class MissingEnvError extends Error {
  /** Exit code 4 per the CLI's exit-code policy. */
  readonly exitCode = 4 as const;
  constructor(readonly missing: ReadonlyArray<keyof EnvSpec>) {
    super(
      `missing required environment variables: ${missing.join(', ')}. ` +
        `Set them in .env or the shell before running.`,
    );
    this.name = 'MissingEnvError';
  }
}
