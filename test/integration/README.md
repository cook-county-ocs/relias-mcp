# Integration Tests

Tests that hit real external surfaces — Relias IdP, Relias search API, the
`cook-county-ocs/ocs-relias-snapshots` remote — and need real credentials.
They are NOT part of the default `npm test` suite and are NOT run in CI.

## Running

```sh
# All integration tests (each skips itself if its credentials are missing)
npm run test:integration

# A single integration test file
npx vitest run --config vitest.integration.config.ts \
  test/integration/snapshot-store.integration.test.ts
```

Each test uses `describe.skipIf(...)` to skip itself when its required
environment variables or files aren't present. A test run on a machine
with no credentials should pass with skipped tests rather than fail.

## The token-rotation gotcha

Relias issues **one-time rotating** refresh tokens (LD-RM-16). Each
`new OidcAuth(envToken).getAccessToken()` call burns the env-supplied
token. After PR #17's refactor, each test FILE shares a single
`OidcAuth` instance via `beforeAll` — so within one file, the token
is burned once and all the tests run against the cached/rotated state.

**Cross-file is unavoidable.** Vitest isolates each test file in its
own worker. The OIDC test, the SearchApi test, and the CLI cron
rehearsal each construct their own OidcAuth, each burning the env
token a fresh time. With one harvested token you can run **one**
OIDC-touching file per `npm run test:integration` invocation.

Three practical patterns:

```sh
# Pattern 1: F5 CLI cron rehearsal alone — the most bang per token.
# Exercises F1 + F2 + F3 + F5 in one grant.
npx vitest run --config vitest.integration.config.ts \
  test/integration/cli-snapshot.integration.test.ts

# Pattern 2: One file at a time — harvest fresh token between runs.
npx vitest run --config vitest.integration.config.ts \
  test/integration/oidc-auth.integration.test.ts
# ... harvest new token via bootstrap-refresh-token.mjs ...
npx vitest run --config vitest.integration.config.ts \
  test/integration/search-api.integration.test.ts

# Pattern 3: Run F3 alone — no OIDC needed, just the deploy key.
RELIAS_RUN_REMOTE_INTEGRATION=1 npx vitest run \
  --config vitest.integration.config.ts \
  test/integration/snapshot-store.integration.test.ts
```

## Credentials per file

| File                                 | Required                                                             | Tokens burned per run |
| ------------------------------------ | -------------------------------------------------------------------- | --------------------- |
| `oidc-auth.integration.test.ts`      | `RELIAS_OIDC_REFRESH_TOKEN`                                          | 1                     |
| `search-api.integration.test.ts`     | `RELIAS_OIDC_REFRESH_TOKEN`                                          | 1                     |
| `snapshot-store.integration.test.ts` | `~/.ssh/relias-snapshots-deploy` + `RELIAS_RUN_REMOTE_INTEGRATION=1` | 0 (no OIDC)           |
| `cli-snapshot.integration.test.ts`   | All of the above                                                     | 1 (covers F1+F2+F3)   |

## Why the opt-in for remote-write tests

Both `snapshot-store.integration.test.ts` and `cli-snapshot.integration.test.ts`
push to the real snapshots repo (on a disposable branch). The
`RELIAS_RUN_REMOTE_INTEGRATION=1` opt-in keeps them from firing
unexpectedly on a dev machine that happens to have the deploy key —
a dev might pull the repo onto a new machine, install deps, run
`npm run test:integration` to see what's there, and not realize
the F3/F5 tests would mutate the production snapshots repo.

The OIDC + SearchApi tests don't have this opt-in because they're
read-only against Relias.

## Adding a new integration test

1. Create `test/integration/<feature>.integration.test.ts`.
2. Wrap your `describe` with `describe.skipIf(!hasEnv('YOUR_VAR'))(...)`.
3. Use `import { hasEnv } from './_skip-when-missing-env.js'`.
4. Document the credentials in the table above.
5. Keep the test fully self-contained — no shared fixtures with unit tests
   (different test runner config).

## Why not run in CI

Each test burns a refresh token or writes to the production snapshots
repo. Running on every PR would either need a separate test-only Relias
account (we don't have one) or generate noise in the production repo.
The cron job in P7 IS the production-equivalent integration run; these
local tests are for human-driven verification before changes ship.
