# npm Release Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the repo ready for a token-free npm release. CI publishes via trusted publishing, no install runs scripts, actions are pinned, and the package metadata and docs are ready for a public announcement.

**Architecture:**
- Only config and docs change: `package.json`, both workflow files, one line in the smoke script, the README and a new `RELEASING.md`. No library code changes.
- The owner steps in the spec (creating the repo, approvals, publishing) are not part of this plan.

**Tech Stack:** GitHub Actions, npm ≥ 11.5.1 (OIDC trusted publishing), Node 22.14+.

**Spec:** `docs/superpowers/specs/2026-11-05-npm-release-design.md`

## Global Constraints

- No npm token anywhere. Remove `NODE_AUTH_TOKEN` / `secrets.NPM_TOKEN` entirely.
- The publish job runs no install except the global npm upgrade (`npm install -g npm@<exact>`, with exact ≥ 11.5.1).
- Every `npm ci` and `npm install` in CI and in `test/smoke/run.mjs` runs with `--ignore-scripts`.
- Every third-party action is pinned to a full 40-character commit SHA with `# vX.Y.Z` after it.
- `repository.url` is exactly `git+https://github.com/nguyenchanh0201/vietqr-node.git`.
- `publishConfig` is exactly `{ "access": "public" }`, with no `provenance` key.
- Runtime dependencies stay exact (`@napi-rs/canvas` 1.1.0, `qrcode` 1.5.4, `zxing-wasm` 3.1.6).
- Before committing:
  - Run `unset GIT_CONFIG_COUNT GIT_CONFIG_VALUE_0 GIT_CONFIG_VALUE_1`.
  - Author and committer are `Chánh Nguyễn <chanhnguyen34@gmail.com>`.
  - No AI-attribution trailer.
- No push, no repo creation, no tag, no publish.

## Review Focus

1. **Native packages without scripts.** `@napi-rs/canvas` and `zxing-wasm` must still load in the smoke consumers when installed with `--ignore-scripts`. If either fails, stop and report; don't work around it.
2. **tsup without esbuild's postinstall.** tsup's esbuild must still build after `npm ci --ignore-scripts`. The build runs inside the smoke script.
3. **Tag/version check.** The publish job must still fail when the tarball version and the tag differ. Keep that step byte-identical.
4. **Pinned SHAs.** Each SHA must be the commit the tag points to (dereference annotated tags), not the tag object's SHA. Otherwise the action fails to resolve in CI.
5. **Packed file list.** `npm pack --dry-run` must list only `dist/`, `assets/`, `LICENSE`, `DISCLAIMER.md`, `README.md` and `package.json`. New docs like `RELEASING.md` must not end up in the tarball.

---

### Task 1: CI and smoke hardening

**Files:**
- Modify: `.github/workflows/ci.yml`
- Modify: `.github/workflows/sync-banks.yml` (pins only)
- Modify: `test/smoke/run.mjs:30`

**Interfaces:** none (config only).

- [ ] **Step 1: Add `--ignore-scripts` to the smoke consumer install.**
  In `test/smoke/run.mjs:30`, add `'--ignore-scripts'` to the npm install args next to `'--no-audit'`.

- [ ] **Step 2: Verify the whole gate locally without scripts.**
  Run: `rm -rf node_modules && npm ci --ignore-scripts && npx tsc --noEmit && npx vitest run && node test/smoke/run.mjs`
  Expected: tsc is clean, 492 tests pass, and the smoke run ends with `SMOKE PASSED` and `network attempts: 0`.
  If anything fails because a script didn't run, stop and report which package failed and the error.

- [ ] **Step 3: Resolve the action SHAs.**
  For each action, find the latest release tag on the major version already used, and resolve it to its commit:
  - `actions/checkout` v4
  - `actions/setup-node` v4
  - `actions/upload-artifact` v4
  - `actions/download-artifact` v4
  - `actions/setup-python` v5
  - the `peter-evans/create-pull-request` major in `sync-banks.yml`

  Use `gh api repos/<owner>/<repo>/commits/<tag> --jq .sha`, which dereferences annotated tags. Run `gh auth switch --hostname github.com --user nguyenchanh0201` first.

- [ ] **Step 4: Edit `ci.yml`.**
  - Test job: `npm ci` becomes `npm ci --ignore-scripts`.
  - Every `uses:` becomes `owner/repo@<sha> # vX.Y.Z`.
  - Publish job:
    - setup-node: `node-version: 22.14.0` or later; keep `registry-url`.
    - Add the step `run: npm install -g npm@<exact ≥ 11.5.1>` before publish, with the exact version written into the file.
    - The publish step is `npm publish "$TARBALL" --access public`, with no `env:` block.
    - Keep the download, checksum and version-check steps unchanged.

- [ ] **Step 5: Edit `sync-banks.yml`.** Replace every `uses:` with its SHA pin. Change nothing else.

- [ ] **Step 6: Lint.**
  Run: `actionlint .github/workflows/*.yml` if it's installed; otherwise `npx --yes actionlint-cli`, or skip and say so in the report.
  Expected: no errors.
  Also run `grep -n "NPM_TOKEN\|NODE_AUTH_TOKEN" .github/workflows/*.yml`. Expected: no output.

- [ ] **Step 7: Commit** `ci: token-free trusted publishing, ignore install scripts, pin actions`.

### Task 2: Package metadata, README and runbook

**Files:**
- Modify: `package.json`
- Modify: `README.md` (badges at the top, plus a new section)
- Create: `RELEASING.md`

**Interfaces:** none.

- [ ] **Step 1: `package.json`.**
  Add `description`, `keywords`, `author`, `repository`, `homepage`, `bugs` and `publishConfig` exactly as in spec §1, but without `provenance`. Put them after `license`. Run `npm pkg fix --dry-run`, if your npm supports it, or `node -e "require('./package.json')"`, and confirm the JSON is valid.

- [ ] **Step 2: README badges.**
  Directly under `# vietqr-node`, add three badges:
  - CI: `https://github.com/nguyenchanh0201/vietqr-node/actions/workflows/ci.yml/badge.svg?branch=main`, linked to the workflow page.
  - npm version: `https://img.shields.io/npm/v/vietqr-node`, linked to the npm package page.
  - License: `https://img.shields.io/npm/l/vietqr-node`.

- [ ] **Step 3: README "Release & supply chain" section.**
  Put it before the license/credits section. It says, in a few lines:
  - Releases are published only from GitHub Actions via npm trusted publishing (no tokens).
  - Provenance is available from 0.1.1, and users can verify it with `npm audit signatures`.
  - Runtime dependencies are pinned to exact versions.
  - CI installs with `--ignore-scripts`.

- [ ] **Step 4: `RELEASING.md`.**
  Two parts:
  - **"First release (0.1.0, once)":** spec Owner steps 1–15 as a checkbox list, copied with their exact commands and setting names.
  - **"Routine release":** the 6 steps from spec §5.

- [ ] **Step 5: Verify the packed contents.**
  Run: `npm pack --dry-run 2>&1 | grep -E "^npm notice [0-9.]+[kMG]?B" | awk '{print $NF}' | sed 's#/.*##' | sort -u`
  Expected: exactly `DISCLAIMER.md`, `LICENSE`, `README.md`, `assets`, `dist`, `package.json`.
  Then run `npx vitest run`. Expected: all tests pass.

- [ ] **Step 6: Commit** `chore: package metadata, release docs`.
