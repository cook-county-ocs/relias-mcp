# relias-mcp

Cook County OCS — Relias LMS catalog reconciliation and MCP server.

`relias-mcp` pulls Cook County Juvenile Probation's COPE-approved Relias training
catalog and reconciles it against AOIC's published PDF. It replaces years of manual
reconciliation with a five-second API call.

One Node/TypeScript package with three personalities:

- **library** — pulls the Relias catalog, snapshots it, and reconciles it against a file
- **CLI** — exposes the library to terminal users and to cron
- **MCP server** — exposes the library to Claude and Claude Code

The library is the product; the CLI and MCP are thin layers over it.

## Status

v1.0 in development. This is the **first citizen** to migrate to the `cook-county-ocs`
GitHub organization. See the build spec in [`docs/specs/relias-mcp-v1.0.md`](docs/specs/relias-mcp-v1.0.md)
for the architecture, features, and phase ladder.

## Install

```bash
npm ci
npm run build
```

Requires Node ≥ 22.

## Usage (after F5/F6 land)

```bash
relias-mcp snapshot              # pull catalog, write snapshot + diff
relias-mcp reconcile <file>      # reconcile a PDF/XLSX/CSV/DOCX against the latest snapshot
relias-mcp diff                  # show the latest catalog diff
relias-mcp doctor                # verify config and connectivity
```

The MCP server (`relias-mcp-server`) exposes `relias-get-latest-diff`,
`relias-force-refresh`, and `relias-reconcile-catalog` over stdio.

## Authentication

`relias-mcp` authenticates to Relias with **OIDC against `login.reliaslearning.com`
using a refresh-token grant** (LD-RM-04). The `OidcAuth` class (`src/lib/oidc-auth.ts`)
holds a refresh token, exchanges it for a short-lived access token, caches that token in
memory, and refreshes transparently when it nears expiry.

The initial refresh token is bootstrapped manually from a logged-in browser session
(chore C7) and installed as the `RELIAS_OIDC_REFRESH_TOKEN` secret (chore C8). It expires
roughly every 30–90 days; renewing it is a manual re-run of C7/C8 in v1.0.

Tokens are never logged — pino's `redact` scrubs `access_token`, `refresh_token`, and
`id_token` from structured output.

> **F1 status:** the `OidcAuth` interface, types, and test scaffold are in place; the
> implementation is a 🎓 exercise (see [CLAUDE.md](CLAUDE.md)).

## Development

See [BUILDING.md](BUILDING.md) for the dev loop and [RELEASING.md](RELEASING.md) for the
release process. Project conventions and tutor notes live in [CLAUDE.md](CLAUDE.md).

## License

MIT. See [LICENSE](LICENSE).
