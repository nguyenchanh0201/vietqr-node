# vietqr-node — first public npm release (design)

Date: 2026-11-05
Status: draft, awaiting approval
Related: `docs/superpowers/specs/2026-11-04-vietqr-node-design.md` (package design and its npm-pack smoke release gate)

## Intent

Publish `vietqr-node` 0.1.0 to npm so that two audiences can use it from day one:

1. **mottanrung**, which replaces its api.vietqr.io calls with the package (plan Task 14).
2. **Other Vietnamese Node developers**, who will find it through a developers post the owner plans to write.

Because the release is public and announced, it should look finished: a public GitHub repo with README, license, upstream credit and CI badge, and a version that has really been scanned by bank apps. It is not a hidden beta.

The main concern is **supply-chain security**. Recent npm compromises (the Shai-Hulud worm, and the phished maintainer account behind the chalk/debug incident) worked by stealing publish tokens or phishing 2FA codes and then pushing poisoned versions. Anyone who installs `vietqr-node` from the post trusts every future version, so the release path should leave nothing long-lived to steal.

## Goals

- Releases are published only by GitHub Actions through **npm trusted publishing (OIDC)**. No npm token is stored in GitHub or on any machine.
- Once the package exists, the npm package setting **"Require two-factor authentication and disallow tokens"** is on.
- The tarball that gets published is the exact one CI built, tested, smoke-tested and checksummed. The publish job never installs dependencies.
- A tag alone cannot release. The `npm-publish` GitHub environment needs the owner's manual approval.
- From 0.1.1 on, every release carries npm provenance.
- Runtime dependencies stay pinned to exact versions.

## Non-goals

- Automated versioning or changelog tooling (changesets, semantic-release). Versions are bumped by hand at this stage.
- Publishing under an npm scope or organisation. The name stays `vietqr-node`, which is unclaimed as of 2026-11-04.
- Release notes automation. A short GitHub Release written by hand is enough.
- Writing the developers post itself.

## Anti-goals (failure even if a publish "works")

- A long-lived npm publish token anywhere: a GitHub secret, `~/.npmrc` or a CI variable.
- Publishing a tarball that was rebuilt after testing, or one built by a job that ran dependency install scripts.
- Announcing a version that no real bank app has scanned.
- Any commit with an AI-attribution trailer, or authored by anyone other than `Chánh Nguyễn <chanhnguyen34@gmail.com>`.

## Facts this design rests on

Checked on 2026-11-05 against https://docs.npmjs.com/trusted-publishers:

- Trusted publishing requires **npm CLI ≥ 11.5.1 and Node ≥ 22.14.0**. Node 22's bundled npm is older, so the publish job must upgrade npm.
- The workflow needs `permissions: id-token: write`. The trusted-publisher form takes the workflow **filename** (`ci.yml`) and an optional **environment name** (`npm-publish`).
- Provenance is automatic with OIDC from a public repo for a public package, so `--provenance` is not needed. Keeping it is harmless.
- Only GitHub-hosted runners are supported.
- A new trusted-publisher configuration must have a successful publish **within 2 days** or it expires.
- Setup starts from the package's settings page, so **the package must already exist**. Community sources agree that the very first version cannot be published through OIDC.
- The setting "Require two-factor authentication and disallow tokens" (Settings → Publishing access) blocks token publishes and leaves trusted publishers working.

## Decisions (as agreed with the owner)

- **Release route:** "Option A". Push a `v*` tag, CI tests and packs, and a CI job publishes the tested tarball.
- **First publish (my call, see "Calls made" below):** 0.1.0 is published **manually from the owner's laptop with 2FA**, using the CI-built tarball. No token is ever created. Consequence: 0.1.0 has no provenance badge; 0.1.1 is the first release with one.
- **The owner already has an npm account.** On the local machine `npm whoami` currently fails, so the owner logs in during the release.
- **Account hardening:** the owner switches npm and GitHub 2FA to a passkey or security key, not SMS or an authenticator app.

## Work: repository changes (builder)

Everything happens on a branch off `feat/vietqr-node` (or on that branch itself, before it merges).

### 1. `package.json` metadata

Add the following. Use the exact `repository.url` form shown: provenance and trusted publishing compare it against the GitHub repo.

```json
"description": "VietQR / NAPAS247 for Node: build, parse, decode and render payment QR codes offline. TypeScript port of vietqr-core.",
"keywords": ["vietqr", "napas", "napas247", "emvco", "qr", "qrcode", "vietnam", "payment", "bank", "nestjs"],
"author": "Chánh Nguyễn <chanhnguyen34@gmail.com>",
"repository": { "type": "git", "url": "git+https://github.com/nguyenchanh0201/vietqr-node.git" },
"homepage": "https://github.com/nguyenchanh0201/vietqr-node#readme",
"bugs": { "url": "https://github.com/nguyenchanh0201/vietqr-node/issues" },
"publishConfig": { "access": "public", "provenance": true }
```

Runtime `dependencies` are already exact (`1.1.0`, `1.5.4`, `3.1.6`). Leave them that way and keep the lockfile committed.

### 2. `.github/workflows/ci.yml`

- **Test job:** `npm ci` becomes `npm ci --ignore-scripts`. Leave the rest unchanged.
  - The builder must confirm that tsc, vitest, tsup and the smoke test still pass. Known candidate to check: `esbuild`, used by tsup, has a postinstall. It normally works without it through its platform optional dependency.
  - If some dependency genuinely needs its script, run only that one explicitly (for example `npm rebuild <pkg>`) and record why in a comment. Do not drop the flag.
- **Publish job:**
  - Delete the `NODE_AUTH_TOKEN` / `secrets.NPM_TOKEN` env.
  - Keep `environment: npm-publish`, `id-token: write`, the artifact download, the checksum check and the tag-equals-version check.
  - Set Node to `22.14.0` or later. Add `npm install -g npm@<exact version ≥ 11.5.1>` before publishing. The builder picks the exact version and writes it down. The job must not run any other install.
  - Publish with `npm publish "$TARBALL" --access public`. `--provenance` is optional.
  - Keep `registry-url: https://registry.npmjs.org` in setup-node.
- **All third-party actions** (`actions/checkout`, `actions/setup-node`, `actions/upload-artifact`, `actions/download-artifact`) are pinned to a full commit SHA, with the version in a trailing comment (`# v4.x.y`).
- **Top-level `permissions: contents: read`** stays.

### 3. `.github/workflows/sync-banks.yml`

- Pin `actions/checkout`, `actions/setup-python` and `peter-evans/create-pull-request` to commit SHAs in the same way. Behaviour is unchanged.

### 4. README

- Add badges at the top for the CI status of `ci.yml` on `main`, the npm version, and the license.
- Add a short **"Release & supply chain"** section:
  - Releases are published only from CI via trusted publishing.
  - Provenance applies from 0.1.1, and users can check it with `npm audit signatures`.
  - Runtime dependencies are pinned.
- Add the two known parse caveats that were deferred earlier: the four UTF-16/UTF-8 inputs that parse rejects, and the `rawTags` key order.

### 5. `RELEASING.md` (new)

The owner's runbook. It contains the "Owner steps" below in checklist form, plus the routine release flow for later versions:

1. Bump the version in `package.json` and the lockfile with `npm version <x.y.z> --no-git-tag-version`.
2. Commit, then open a PR and merge it.
3. Tag `vX.Y.Z` on `main` and push the tag.
4. Approve the `npm-publish` deployment in GitHub.
5. Check that the version page on npmjs.com shows provenance.
6. Write a GitHub Release by hand.

### Verification

Run locally on the builder's machine:
- `npm ci --ignore-scripts && npx tsc --noEmit && npx vitest run && node test/smoke/run.mjs` passes.
- `npm pack --dry-run` lists only `dist`, `assets`, `LICENSE`, `DISCLAIMER.md`, `README.md` and `package.json`.

Check in CI:
- On the PR, all four matrix cells (ubuntu/macos × node 20/22) pass. This is the first time CI runs on Linux.
- `actionlint`, if it's available, is clean on both workflows.

### Commits

- Author and committer are `Chánh Nguyễn <chanhnguyen34@gmail.com>`.
- No AI-attribution trailer.
- The builder does not push, create the GitHub repo, tag or publish. Those are owner steps.

## Owner steps (in order)

Claude can run the `gh` commands for steps 2–3 when the owner says so explicitly, after `gh auth switch --hostname github.com --user nguyenchanh0201`. Everything that touches npm, approvals or 2FA is done by the owner.

**Accounts**

1. On npmjs.com and GitHub, set up a passkey or security key as the 2FA method, and remove SMS if it's set.

**Repo and gates**

2. Create the **public** repo `nguyenchanh0201/vietqr-node` and push `main` plus the feature branch.
3. Open a PR from `feat/vietqr-node` to `main` and wait until CI passes on all four cells.
4. **Bank-app scan gate.** Claude generates test QRs with the package: a dynamic account QR with an amount, a static account QR, and a card QR if a bank app supports it. The owner scans each with at least two different Vietnamese bank apps and confirms that the account name and amount appear, without paying.
   - Any failure blocks the release.
5. **mottanrung gate.** The Task 14 branch (`nguyenchanh0201/feat-vietqr-node`) passes its tests against the packed tarball.
6. Merge the PR.

**GitHub configuration**

7. Create the environment `npm-publish`:
   - Required reviewer: `nguyenchanh0201`.
   - Deployment tags rule: `v*` only.

**Publish 0.1.0 (manual, once)**

8. Tag `v0.1.0` on `main` and push it. The CI test job builds the artifact `package-tarball`. The publish job waits for approval; **reject it**, because no trusted publisher exists yet and it would fail.
9. Download the artifact and run `sha256sum -c SHA256SUMS`.
10. Run `npm login`, then `npm publish vietqr-node-0.1.0.tgz --access public` and confirm with 2FA.
11. On npmjs.com, go to `vietqr-node` → Settings:
    - Add a trusted publisher: GitHub Actions, owner `nguyenchanh0201`, repo `vietqr-node`, workflow `ci.yml`, environment `npm-publish`.
    - Set Publishing access to **"Require two-factor authentication and disallow tokens"**.
12. Run `npm logout` on the laptop.

**Prove the CI path (within 2 days of step 11)**

13. Release 0.1.1 through the routine flow in `RELEASING.md`. The minimum is a README or metadata change.
14. Check:
    - The 0.1.1 page on npmjs.com shows provenance.
    - `npm audit signatures` passes in a fresh project.

**Announce**

15. Write the developers post. 0.1.1 or later shows the badge.

## Calls made (not explicitly decided by the owner)

- **Manual first publish instead of a one-day token.** This keeps the "never a token" rule intact. The price is that 0.1.0 has no provenance badge.
- **0.1.1 as a deliberate second release, within the 2-day expiry window.** It proves the CI path works before the post goes out.
- **The environment approval is required** and restricted to `v*` tags.
- **`npm ci --ignore-scripts`** in CI, with the narrow `npm rebuild <pkg>` escape hatch.
- **SHA-pinning actions** in both workflows.
- The `description` and `keywords` wording.
- No changelog tooling yet.

## Left to the builder

- The exact npm version to install in the publish job (≥ 11.5.1) and the action commit SHAs, each with its tag in a comment.
- The badge style and the exact README section wording.
- Whether to run `actionlint` locally.

## Open risks

- **First publish via OIDC.** The claim that the first publish can't use OIDC comes from community sources and the shape of the docs, not from an explicit statement. If npm turns out to allow it, the manual step is merely unnecessary, not harmful.
- **`--ignore-scripts` could break a dependency** we haven't checked; esbuild is the most likely. The builder verifies it.
- **Not tested on Linux yet.** If a Linux-only failure shows up in step 3, it becomes a fix task before release.
