# Releasing relias-mcp

The full release walkthrough is finalized in P8. This is the skeleton.

## Versioning

- **Build version** (this package's `version`) follows semver and versions independently
  of the spec. v1.0 ships as `1.0.0`.
- The spec versions on its own track (currently spec v1.1) — don't couple them.

## Release steps (P8 will flesh these out)

1. Ensure `main` is green (CI passing) and all v1.0 phases (P0–P7) are merged.
2. Update `CHANGELOG.md`: move entries from `Unreleased` into a dated `1.0.0` section.
3. Bump `version` in `package.json` to `1.0.0`.
4. Commit: `chore(release): v1.0.0`.
5. Tag: `git tag v1.0.0 && git push origin v1.0.0`.
6. Open a separate PR against `OCS-Ecosystem` adding relias-mcp to the citizen table.

## Cron note

The weekly snapshot workflow (`.github/workflows/snapshot.yml`, added in P7) is not part
of the release tag — it runs continuously once `main` has it. A release does not pause or
restart the cron.
