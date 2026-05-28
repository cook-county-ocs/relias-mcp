#!/bin/zsh

  git clone /tmp/relias-demo/bare.git /tmp/relias-demo/seed
  cd /tmp/relias-demo/seed
  git config user.email demo@local
  git config user.name demo
  mkdir snapshots
  cp /Users/marty/Local_Dev_Projects/OCS-Ecosystem/relias-mcp/test/fixtures/cope-catalog-snapshot-2026-05-26.json snapshots/2026-05-26T18-00-00Z.json
  git add snapshots
  git commit -m "seed: demo snapshot"
  git push origin main