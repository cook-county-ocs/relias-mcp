#!/usr/bin/env zsh
# Sourceable helper that exports the env vars the integration tests need.
#
# **MUST be sourced, not executed** — env vars exported by a child process
# don't propagate to the parent shell. Two ways:
#
#   . ./scripts/relias_redirect.sh          # POSIX-style source (works in zsh + bash)
#   source ./scripts/relias_redirect.sh     # zsh/bash keyword (more readable)
#
# Run from the relias-mcp repo root.
#
# Usage:
#
#   # Mode A — bootstrap a fresh refresh token interactively (you'll click
#   # through the browser auth flow when prompted):
#   source ./scripts/relias_redirect.sh
#
#   # Mode B — you already have a refresh token (pass as first arg):
#   source ./scripts/relias_redirect.sh "<refresh_token>"
#
# What gets exported in your shell after sourcing:
#   RELIAS_REDIRECT_URI               (hardcoded — the AOIC silent-renew URL)
#   RELIAS_OIDC_REFRESH_TOKEN         (from bootstrap or your arg)
#   RELIAS_RUN_REMOTE_INTEGRATION=1   (opt-in for F3/F5 remote-write tests)
#
# After sourcing, you can run integration tests directly:
#
#   npx vitest run --config vitest.integration.config.ts \
#     test/integration/cli-snapshot.integration.test.ts

# Wrap everything in a function so `local` is valid (zsh/bash require it
# only inside functions). Function is unset at the end so it doesn't
# pollute the sourcing shell — only the exported env vars persist.
relias_redirect_setup() {
  # --- locate repo root for path-independent operation ---
  # When sourced, the script's own path is in $0 (bash) or via the zsh
  # prompt-expansion %x (zsh). Walk up from there to repo root.
  local script_path
  if [[ -n "${BASH_SOURCE[0]-}" ]]; then
    script_path="${BASH_SOURCE[0]}"
  elif [[ -n "${(%):-%x}" ]]; then
    script_path="${(%):-%x}"
  else
    echo "relias_redirect: unsupported shell — needs zsh or bash" >&2
    return 1
  fi
  local repo_root
  repo_root="$(cd "$(dirname "$script_path")/.." && pwd)"

  # --- hardcoded constants (exports propagate from function to caller shell) ---
  export RELIAS_REDIRECT_URI="https://aoic.training.reliaslearning.com/new/silent-renew.html"
  export RELIAS_RUN_REMOTE_INTEGRATION=1

  # --- token: either provided as $1, or harvested fresh via bootstrap ---
  local provided_token="${1-}"
  if [[ -n "$provided_token" ]]; then
    echo "relias_redirect: using provided refresh token (length ${#provided_token})" >&2
    export RELIAS_OIDC_REFRESH_TOKEN="$provided_token"
  else
    echo "relias_redirect: no token provided — running bootstrap (interactive)" >&2
    echo "relias_redirect: paste the auth code when prompted; token will be captured automatically" >&2
    local token
    token="$(node "$repo_root/scripts/bootstrap-refresh-token.mjs")"
    local rc=$?
    if [[ $rc -ne 0 || -z "$token" ]]; then
      echo "relias_redirect: bootstrap failed (exit $rc) — no token exported" >&2
      return $rc
    fi
    export RELIAS_OIDC_REFRESH_TOKEN="$token"
  fi

  # --- confirmation ---
  echo "" >&2
  echo "relias_redirect: env exported. Verify:" >&2
  echo "  RELIAS_REDIRECT_URI=$RELIAS_REDIRECT_URI" >&2
  echo "  RELIAS_OIDC_REFRESH_TOKEN=<len ${#RELIAS_OIDC_REFRESH_TOKEN}, ${RELIAS_OIDC_REFRESH_TOKEN:0:8}...${RELIAS_OIDC_REFRESH_TOKEN: -8}>" >&2
  echo "  RELIAS_RUN_REMOTE_INTEGRATION=$RELIAS_RUN_REMOTE_INTEGRATION" >&2
  echo "" >&2
  echo "relias_redirect: ready. Suggested next:" >&2
  echo "  npx vitest run --config vitest.integration.config.ts \\" >&2
  echo "    test/integration/cli-snapshot.integration.test.ts" >&2
}

# Run, capture exit, clean up the function so we don't pollute the shell.
relias_redirect_setup "$@"
_relias_rc=$?
unset -f relias_redirect_setup
# When sourced, `return` is valid; the rc propagates as the source's exit
# status so `source ... && next-command` chains work.
return $_relias_rc 2>/dev/null
