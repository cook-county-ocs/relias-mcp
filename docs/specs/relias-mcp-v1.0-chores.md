# relias-mcp v1.0 — Operational Chores Checklist

**Date:** 2026-05-26
**Owner:** Marty (chores are operational; not Claude Code work)
**Companion to:** `relias-mcp-v1.0-spec.md` (v1.1)
**Estimated total time:** ~50 minutes if done in one sitting; can be spread across the build

---

## How to Use This Checklist

Thirteen chores. Each one is a discrete operational task you perform — clicking through GitHub UI, running a command on your machine, pasting a value. Chores are not coding; they unblock coding.

Chores cluster naturally into three batches you can execute when you have time:

- **Batch 1 (Day 0, ~20 min):** C1–C4 — org and repo creation, keypair generation. Must be done before Claude Code starts P0.
- **Batch 2 (between P3 and P7, ~15 min):** C5–C8, C11, C12 — deploy keys installed, OIDC harvested, branch protection. Must be done before the cron actually runs in P7.
- **Batch 3 (before P6 merges, ~10 min):** C9, C10 — PAT for `relias-force-refresh`. Only needed when the MCP server tries to dispatch the workflow.

C13 is deferred — it triggers when training-scheduler migrates, not during v1.0.

The chore IDs (C1, C2, …) match the IDs in the spec's §11 Chores section. The spec's phase ladder calls out which chores block which phase.

---

## Summary Table

| ID | Chore | Owner | Time | Batch | Blocks |
|---|---|---|---|---|---|
| C1 | Create `cook-county-ocs` GitHub Org | Marty | 5 min | 1 | Everything |
| C2 | Create `cook-county-ocs/relias-mcp` repo | Marty | 5 min | 1 | P0 |
| C3 | Create `cook-county-ocs/ocs-relias-snapshots` repo | Marty | 5 min | 1 | P3 |
| C4 | Generate SSH deploy keypair | Marty | 2 min | 1 | C5, C6 |
| C5 | Install public key on snapshots repo | Marty | 3 min | 2 | P7 cron push |
| C6 | Install private key as secret on relias-mcp | Marty | 3 min | 2 | P7 cron push |
| C7 | Harvest OIDC refresh token from Relias session | Marty | 5 min | 2 | P7 cron auth |
| C8 | Install OIDC refresh token as secret | Marty | 2 min | 2 | P7 cron auth |
| C9 | Generate fine-grained PAT for `workflow_dispatch` | Marty | 5 min | 3 | F6 deployment |
| C10 | Install PAT as secret | Marty | 2 min | 3 | F6 deployment |
| C11 | Branch protection on `relias-mcp` `main` | Marty | 5 min | 2 | (advisory, not strict) |
| C12 | Branch protection on `ocs-relias-snapshots` `main` | Marty | 3 min | 2 | P7 cron push |
| C13 | Promote OIDC secret to org-level (deferred) | Marty | 5 min | — | training-scheduler v1.0 |

---

## Batch 1 — Day 0, Before P0

Run these before handing the spec to Claude Code. The build can't start without them.

### C1 — Create `cook-county-ocs` GitHub Organization

- [x] Navigate to https://github.com/organizations/new
- [x] Select **Free** plan (sufficient for v1.0; can upgrade later)
- [x] Organization name: `cook-county-ocs`
- [x] Contact email: your work email (`marty.gleason@cookcountyil.gov` or equivalent)
- [x] Belongs to: "My personal account"
- [x] Verify: org URL is `https://github.com/cook-county-ocs`
- [x] Settings → Member privileges → Repository creation: Public, Private, Internal — leave defaults
- [x] Settings → Member privileges → Base permissions: **None** (no implicit access; grant per-repo)

**Verification:** You can navigate to `https://github.com/cook-county-ocs` and see an empty org page.

**Time:** 5 minutes.

### C2 — Create `cook-county-ocs/relias-mcp` Repository

- [x] Navigate to https://github.com/organizations/cook-county-ocs/repositories/new
- [x] Repository name: `relias-mcp`
- [x] Description: `Cook County OCS — Relias LMS catalog reconciliation and MCP server`
- [x] Visibility: **Public** (OCS-Ecosystem convention is public-by-default for non-PII repos)
- [x] Initialize with: **README** (Claude Code replaces in P0), **MIT License**, **.gitignore: Node**
- [x] Default branch: `main`
- [x] Click "Create repository"

**Verification:** Empty repo at `https://github.com/cook-county-ocs/relias-mcp` with README, LICENSE, and `.gitignore`.

**Time:** 5 minutes.

### C3 — Create `cook-county-ocs/ocs-relias-snapshots` Repository

- [x] Navigate to https://github.com/organizations/cook-county-ocs/repositories/new
- [x] Repository name: `ocs-relias-snapshots`
- [x] Description: `Automated Relias catalog snapshots — written by relias-mcp cron. Do not edit manually.`
- [x] Visibility: **Public** (catalog data is public-facing; audit trail is more useful when readable)
- [x] Initialize with: **README** only
- [x] Default branch: `main`
- [x] Click "Create repository"

**After creation, edit the README to be informative:**

- [ ] Replace README content with:

  ```markdown
  # ocs-relias-snapshots
  
  Automated weekly snapshots of the Cook County Juvenile Probation COPE-approved
  Relias training catalog. Written by [relias-mcp](https://github.com/cook-county-ocs/relias-mcp)
  on a Monday 06:00 Central schedule.
  
  Do not edit manually — the cron will overwrite manual changes.
  
  ## Structure
  
  - `snapshots/YYYY-MM-DDTHH-MM-SSZ.json` — full catalog snapshot per run
  - `diffs/YYYY-MM-DDTHH-MM-SSZ-from-PREV.json` — diff vs previous snapshot
  
  ## Recovery
  
  If a snapshot is lost or corrupt, the most recent state can be re-pulled by
  running `relias-mcp snapshot` on demand via the relias-mcp workflow_dispatch.
  ```

- [x] Commit directly to `main`

**Verification:** Repo at `https://github.com/cook-county-ocs/ocs-relias-snapshots` with informative README.

**Time:** 5 minutes.

### C4 — Generate SSH Deploy Keypair

On your personal laptop (or any machine you trust):

- [x] Open terminal
- [x] Run:

  ```bash
  cd ~/.ssh
  ssh-keygen -t ed25519 -f relias-snapshots-deploy -C "relias-mcp-cron" -N ""
  ```

  Notes:
  - `-N ""` = no passphrase (cron can't type one)
  - `-C "relias-mcp-cron"` = comment in the key, helpful for audit
  - `-t ed25519` = modern algorithm, smaller than RSA, well-supported

- [x] Verify both files exist:

  ```bash
  ls -la ~/.ssh/relias-snapshots-deploy*
  ```

  Should show two files: `relias-snapshots-deploy` (private, ~400 bytes) and `relias-snapshots-deploy.pub` (public, ~100 bytes).

- [x] Display public key for copying:

  ```bash
  cat ~/.ssh/relias-snapshots-deploy.pub
  ```

  Save this output for C5.

- [x] Display private key for copying:

  ```bash
  cat ~/.ssh/relias-snapshots-deploy
  ```

  Save this output (including `-----BEGIN OPENSSH PRIVATE KEY-----` and `-----END OPENSSH PRIVATE KEY-----` lines) for C6.

**Verification:** Both `cat` commands produce content. The private key starts with `-----BEGIN OPENSSH PRIVATE KEY-----`.

**Time:** 2 minutes.

**Security note:** The private key is sensitive. Don't paste it into Slack, email, or any other location besides C6's GitHub Secret. Don't `cat` it into a shell that's being screen-recorded.

---

## Batch 2 — Before P7 Cron Runs

These chores activate the auth pieces. Do them after P3 lands and before P7 starts. C11 is best done after P0 merges so CI status checks exist.

### C5 — Install Public Key on Snapshots Repo

- [x] Navigate to https://github.com/cook-county-ocs/ocs-relias-snapshots/settings/keys
- [x] Click **Add deploy key**
- [x] Title: `relias-mcp cron writer`
- [x] Key: paste the content of `relias-snapshots-deploy.pub` from C4
- [x] **Check "Allow write access"** (critical — without this, cron pushes fail)
- [x] Click "Add key"

**Verification:** The deploy key appears in the list with a green "Write" badge.

**Time:** 3 minutes.

### C6 — Install Private Key as Repo Secret on relias-mcp

- [x] Navigate to https://github.com/cook-county-ocs/relias-mcp/settings/secrets/actions
- [x] Click **New repository secret**
- [x] Name: `	`
- [x] Secret: paste the entire content of `relias-snapshots-deploy` (private key) from C4, including the `-----BEGIN` and `-----END` lines
- [x] Click "Add secret"

**Verification:** Secret listed under Actions secrets with the correct name. (Value is hidden once saved — you cannot view it again, only update or delete.)

**Time:** 3 minutes.

**If you mess this up:** Delete the secret and re-add. Never edit by truncation; the entire private-key block must be present.

### C7 — Harvest OIDC Refresh Token

This one is browser-driven and time-sensitive (refresh tokens expire). Do it close to when you'll run C8.

- [ ] Open Chrome / Firefox / Edge on your personal laptop
- [ ] Navigate to https://aoic.training.reliaslearning.com
- [ ] Sign in normally (username/password)
- [ ] Wait for the dashboard to fully load
- [ ] Open dev tools (F12 or Cmd+Opt+I)
- [ ] Go to **Console** tab
- [ ] Paste and run:

  ```javascript
  JSON.parse(sessionStorage["oidc.user:https://login.reliaslearning.com:rlms-website"]).refresh_token
  ```

- [ ] The result is a long string (typically 50-200 chars). Copy it verbatim — no quotes, no whitespace.

**Verification:** You have a string starting with characters like `def502...` or similar. Length looks plausible (50+ characters).

**Time:** 5 minutes.

**Important caveats:**

- The refresh token is sensitive. Treat it like a password. Don't paste it into chat, email, or anywhere besides C8's GitHub Secret.
- The token will expire in 30-90 days (Relias's policy is undocumented; the spec assumes 30 days for conservative planning). When the cron starts failing with auth errors, re-do C7 and C8.
- If you log out of Relias between C7 and C8, the token is invalidated. Do C7 and C8 back-to-back.

### C8 — Install OIDC Refresh Token as Secret

- [ ] Navigate to https://github.com/cook-county-ocs/relias-mcp/settings/secrets/actions
- [ ] Click **New repository secret**
- [ ] Name: `RELIAS_OIDC_REFRESH_TOKEN`
- [ ] Secret: paste the token from C7
- [ ] Click "Add secret"

**Verification:** Secret listed with correct name.

**Time:** 2 minutes.

### C11 — Branch Protection on `relias-mcp` `main`

Best done after P0's CI workflow lands so the status checks exist.

- [ ] Navigate to https://github.com/cook-county-ocs/relias-mcp/settings/branches
- [ ] Click **Add branch protection rule**
- [ ] Branch name pattern: `main`
- [ ] Check:
  - [ ] Require a pull request before merging
  - [ ] Require approvals → set to **1**
  - [ ] Require status checks to pass before merging
  - [ ] Require branches to be up to date before merging
  - [ ] Status checks to require: select the CI workflow check name (e.g., `ci / build-and-test`) once P0 has lit it up
  - [ ] Require conversation resolution before merging
- [ ] Leave unchecked: "Restrict who can push" (you're solo for v1.0)
- [ ] **Leave unchecked: "Do not allow bypassing the above settings"** (you may need to bypass during early debugging)
- [ ] Click "Create"

**Verification:** Protection rule appears in the list applied to `main`.

**Time:** 5 minutes.

### C12 — Branch Protection on `ocs-relias-snapshots` `main`

This one is different — the cron pushes directly via deploy key, so we explicitly do NOT require PRs.

- [ ] Navigate to https://github.com/cook-county-ocs/ocs-relias-snapshots/settings/branches
- [ ] Click **Add branch protection rule**
- [ ] Branch name pattern: `main`
- [ ] Check:
  - [ ] Require linear history
- [ ] **Leave unchecked**:
  - Require pull request before merging (cron pushes directly)
  - Require approvals (no humans review snapshots)
  - Require status checks (no CI on this repo)
- [ ] Click "Create"

**Verification:** Protection rule appears with linear-history-only enforcement. Cron pushes will succeed.

**Time:** 3 minutes.

---

## Batch 3 — Before P6 (MCP Server) Lands

These unblock the `relias-force-refresh` MCP tool. Do them just before P6 merges.

### C9 — Generate Fine-Grained PAT for `workflow_dispatch`

- [ ] Navigate to https://github.com/settings/personal-access-tokens
- [ ] Click **Generate new token** → **Fine-grained token**
- [ ] Token name: `relias-mcp workflow_dispatch`
- [ ] Expiration: **90 days** (re-create when expires; note the expiration date on your calendar)
- [ ] Resource owner: `cook-county-ocs`
- [ ] Repository access: **Only select repositories** → `cook-county-ocs/relias-mcp`
- [ ] Repository permissions:
  - **Actions: Read and write** (required for workflow_dispatch)
  - **Metadata: Read** (auto-required)
- [ ] All other permissions: leave at default (no access)
- [ ] Click "Generate token"
- [ ] **Copy the token immediately** — GitHub will not show it again
- [ ] Save it for C10 (preferably in a temporary scratchpad you can clear after C10)

**Verification:** Token starts with `github_pat_` and is ~80+ characters long.

**Time:** 5 minutes.

**Calendar reminder:** Set a reminder for **90 days from today** to regenerate this PAT. The MCP's `relias-force-refresh` tool will silently start failing when it expires.

### C10 — Install PAT as Secret on relias-mcp

- [ ] Navigate to https://github.com/cook-county-ocs/relias-mcp/settings/secrets/actions
- [ ] Click **New repository secret**
- [ ] Name: `RELIAS_GH_DISPATCH_TOKEN`
- [ ] Secret: paste the PAT from C9
- [ ] Click "Add secret"
- [ ] Clear the scratchpad / password manager / wherever you held the PAT temporarily

**Verification:** Secret listed alongside the other three (`OCS_RELIAS_SNAPSHOTS_DEPLOY_KEY`, `RELIAS_OIDC_REFRESH_TOKEN`, `RELIAS_GH_DISPATCH_TOKEN`).

**Time:** 2 minutes.

---

## Deferred — Post-v1.0

### C13 — Promote `RELIAS_OIDC_REFRESH_TOKEN` to Org-Level Secret

Trigger: when **training-scheduler** migrates to `cook-county-ocs` (the second citizen).

Reason: training-scheduler will also need to talk to Relias (for transcripts in v1.5+). Promoting the OIDC secret to org-level means both citizens share one source-of-truth for the credential.

Steps (placeholder — do not execute now):

- Navigate to org settings → Secrets and variables → Actions
- Create new organization secret `RELIAS_OIDC_REFRESH_TOKEN`
- Repository access: select both `relias-mcp` and `training-scheduler`
- Value: most current refresh token (rotated value, not the v1.0 value if it's been rotated)
- Delete the repo-level secret on `relias-mcp` (org-level supersedes; keeping both creates ambiguity)

---

## Final Verification

When all batches are complete, run this checklist before triggering the first production cron:

- [ ] `cook-county-ocs/relias-mcp` exists, is on `main`, has P0–P7 merged
- [ ] `cook-county-ocs/ocs-relias-snapshots` exists with informative README
- [ ] Four secrets exist on `relias-mcp`:
  - [ ] `OCS_RELIAS_SNAPSHOTS_DEPLOY_KEY`
  - [ ] `RELIAS_OIDC_REFRESH_TOKEN`
  - [ ] `RELIAS_GH_DISPATCH_TOKEN`
  - [ ] (none others)
- [ ] Deploy key exists on `ocs-relias-snapshots` with **Write** access
- [ ] Branch protection on `relias-mcp/main` (require PR + 1 review + CI)
- [ ] Branch protection on `ocs-relias-snapshots/main` (linear history only)
- [ ] PAT in C9 has an expiration reminder on the calendar
- [ ] OIDC refresh token harvest has a reminder for ~30 days out

Then trigger the cron manually via the Actions tab → "Snapshot" workflow → "Run workflow." If it succeeds, watch the snapshots repo for the first commit. If it fails, the most likely culprits in order:

1. Deploy key not installed with write access (C5)
2. Private key truncated in the secret (C6)
3. OIDC refresh token expired or rotated (re-do C7, C8)
4. Branch protection on snapshots repo too aggressive (C12 — remove "require PR" if it crept in)

---

## Pacelt-Flavored Read

The King of the Slams would have skipped half these chores, hit auth errors in production, and blamed AOIC. The discipline of writing them down is what makes them survive personnel transitions. Successors who inherit `relias-mcp` will open this checklist on day one and have a working environment by lunchtime instead of spending three weeks reverse-engineering Marty's hand-rolled setup.

Joe would not appreciate the checklist. The next seat to occupy this work will.

-----
May 26, 2026

OCS — Marty (subject)
OCS-1138 (preparer)

#AI/Claude
