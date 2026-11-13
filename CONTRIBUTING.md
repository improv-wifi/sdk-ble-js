# Contributing

This guide covers local development, pull requests, and how releases of `@improv-wifi/ble-sdk` are built and published.

## Development

Requirements: Node.js 24 and a desktop browser with Web Bluetooth support (Chrome or Edge).

```sh
npm ci
script/develop
```

`script/develop` compiles TypeScript and bundles with Rollup in watch mode, and serves the repository on port 5003. Open <http://localhost:5003/example.html> to try the launch button against a real device (Web Bluetooth needs one that advertises the Improv service). `localhost` counts as a secure context, so Web Bluetooth works without HTTPS.

Before opening a pull request, run the same checks as CI:

```sh
script/build
npm test
npm exec -- prettier --check src test
```

### Project layout

- `src/ble.ts` - the standalone `ImprovBluetoothLE` client (no UI).
- `src/launch-button.ts`, `src/provision-dialog.ts` - the `<improv-wifi-launch-button>` and `<improv-wifi-provision-dialog>` web components.
- `dist/` - build output: ES modules for bundlers, plus a self-contained bundle in `dist/web/` for direct use in a page. Only `dist/` is published to npm.
- `test/` - Vitest tests. `npm test` runs with coverage and fails below 100% for `src/`. `test/build.test.ts` runs the real Rollup build and checks that the entry (`launch-button.js`) stays a single self-contained file and that no lazy chunk imports it.

### Changing GitHub workflows

Actions are referenced by version tag and pinned in `.github/workflows/actions.lock`. After adding or changing any `uses:`, regenerate the lockfile and commit it with the workflow change:

```sh
gh extension install github/gh-actions-lock
gh actions-lock
```

The `Actions lockfile / Verify` check fails if the lockfile is out of date.

## Pull requests

CI runs `CI / Build and test` and `Actions lockfile / Verify` on every pull request.

The labels on merged pull requests decide the next version number:

| Label                                 | Version bump    |
| ------------------------------------- | --------------- |
| `major`, `breaking-change`            | Major (`x.0.0`) |
| `minor`, `enhancement`, `new-feature` | Minor (`0.x.0`) |
| Anything else                         | Patch (`0.0.x`) |

The highest bump among the pull requests merged since the last release wins. Label pull requests before merging; changing the version on the draft release by hand breaks the build (see below). Pull requests labelled `dependencies` are grouped under their own heading in the release notes.

## Releasing

Releases are cut from GitHub draft releases. The package is built and tested once, attached to the draft, and that exact tarball is published to npm. Nothing is rebuilt at publish time.

### How it works

1. **Merge to `main`.** The `Draft release / Update draft` workflow:
   - updates the draft release notes and resolves the next version from the labels above,
   - runs `npm version` and commits the bump to `main` as the Improv Wi-Fi GitHub App,
   - pins the draft to that commit,
   - removes any tarball left on the draft by an earlier build,
   - adds a "Do not publish this release yet" warning to the top of the draft.

   The push of the version bump commit itself does not rerun this workflow, so it cannot reset a build that has already finished.
2. **Build.** When that finishes, `Build release / Build and attach` checks out the pinned commit, checks that `package.json` matches the draft's tag, builds, tests, and attaches `improv-wifi-ble-sdk-<version>.tgz` to the draft. It then removes the warning.
3. **Publish the draft.** When the warning is gone and the tarball is attached, review the notes and publish the release on GitHub.
4. **npm.** `Publish / npm` runs in the `npm` environment. It downloads the tarball from the release, verifies it against the immutable release attestation, checks its version, and publishes it to npm with provenance via trusted publishing (no npm token).

### Rules

- **Do not publish while the warning is on the draft.** Releases are immutable: a release published before its tarball is attached cannot be fixed. `Publish / npm` will fail without touching npm, and the only way forward is to merge another change and release the next version.
- **Do not edit the draft's tag or version by hand.** The version is committed to `package.json` before the build, and `Build release` fails if the tag no longer matches. Use labels to control the bump instead.
- **To rebuild a draft,** run `Build release` manually from the Actions tab (it has a `workflow_dispatch` trigger).

### One-time setup

These are already configured. Check them if a release workflow fails on permissions:

- **GitHub App:** the `IMPROV_GITHUB_APP_CLIENT_ID` repository variable and `IMPROV_GITHUB_APP_PRIVATE_KEY` secret. The app's installation needs Contents (read and write), Pull requests (read), and Attestations (read).
- **Immutable releases:** enabled in the repository settings. `Publish / npm` verifies the release attestation and fails without it.
- **npm trusted publisher:** on npmjs.com, `@improv-wifi/ble-sdk` trusts repository `improv-wifi/sdk-ble-js`, workflow `npmpublish.yml`, environment `npm`.
