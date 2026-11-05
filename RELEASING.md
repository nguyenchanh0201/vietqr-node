# Releasing vietqr-node

Releases are published only from CI through npm trusted publishing (OIDC). No npm token exists anywhere: not in GitHub secrets, not in `~/.npmrc`.

The one exception is the very first version (0.1.0). npm can only set up trusted publishing for a package that already exists, so 0.1.0 is published once by hand with 2FA, using the exact tarball CI built.

## First release (0.1.0, once)

**Accounts**

- [ ] 1. On npmjs.com and GitHub, set up a passkey or security key as the 2FA method, and remove SMS if it's set.

**Repo and gates**

- [ ] 2. Create the **public** repo `nguyenchanh0201/vietqr-node`. Push `main` and `feat/vietqr-node`.
- [ ] 3. Open a PR from `feat/vietqr-node` to `main`. Wait until CI passes on all four cells (ubuntu/macos × node 20/22).
- [ ] 4. **Bank-app scan gate.** Generate test QRs from your own account with a one-off command outside the repo. Never commit them.
  - The QRs to make: a dynamic account QR with an amount, a static account QR, and a card QR if a bank app supports it.
  - Scan each one with at least two different Vietnamese bank apps and confirm the account name and amount show up. Don't pay.
  - Any failure blocks the release.
- [ ] 5. **mottanrung gate.** The mottanrung branch `nguyenchanh0201/feat-vietqr-node` passes its tests against the packed tarball.
- [ ] 6. Merge the PR.

**GitHub configuration**

- [ ] 7. Create the environment `npm-publish` (Settings → Environments):
  - Required reviewer: `nguyenchanh0201`.
  - Deployment branches and tags: tags matching `v*` only.

**Publish 0.1.0 by hand**

- [ ] 8. Tag the release on `main` and push it:
  ```sh
  git checkout main && git pull
  git tag v0.1.0 && git push origin v0.1.0
  ```
  CI builds the artifact `package-tarball`. The publish job waits for approval. **Reject it**: no trusted publisher exists yet, so it would fail.
- [ ] 9. Download the `package-tarball` artifact from that run into an empty folder, then check it:
  ```sh
  gh run download <run-id> -n package-tarball -D vietqr-release && cd vietqr-release
  shasum -a 256 -c SHA256SUMS   # on Linux: sha256sum -c SHA256SUMS
  ```
  (Downloading it from the GitHub web page gives a zip instead: unzip it first.)
- [ ] 10. Publish it, confirming with 2FA:
  ```sh
  npm login
  npm publish vietqr-node-0.1.0.tgz --access public
  ```
- [ ] 11. On npmjs.com, open `vietqr-node` → Settings:
  - Add a trusted publisher: GitHub Actions, owner `nguyenchanh0201`, repository `vietqr-node`, workflow filename `ci.yml`, environment `npm-publish`.
  - Under Publishing access, choose **"Require two-factor authentication and disallow tokens"**.
- [ ] 12. Log out on the laptop: `npm logout`.

**Prove the CI path (within 2 days of step 11, or the trusted-publisher setup expires)**

- [ ] 13. Release 0.1.1 through the routine flow below. A README or metadata change is enough.
- [ ] 14. Check:
  - The 0.1.1 page on npmjs.com shows provenance.
  - `npm audit signatures` passes in a fresh project that installs `vietqr-node`.

**Announce**

- [ ] 15. Write the developers post. 0.1.1 or later shows the provenance badge.

## Routine release

1. Bump the version without tagging: `npm version <x.y.z> --no-git-tag-version`. This updates both `package.json` and `package-lock.json`.
2. Commit, open a PR, and merge it once CI is green.
3. Tag `main` and push the tag:
   ```sh
   git checkout main && git pull
   git tag v<x.y.z> && git push origin v<x.y.z>
   ```
4. In GitHub Actions, approve the `npm-publish` deployment.
   - CI checks that the tarball's checksum and its version match the tag before it publishes.
5. Check that the version page on npmjs.com shows provenance.
6. Write a short GitHub Release by hand.

If the publish job fails with an auth error, check the trusted-publisher settings on npmjs.com. They aren't validated when saved, only when a publish runs. The workflow filename must be exactly `ci.yml` and the environment exactly `npm-publish`. Do not fix it by adding a token.
