# Changelog

## 0.1.1 — 2026-10-24

- Prepare the first public npm distribution under the `groovectl` command.
- Add repository links, public-registry publishing configuration, and release
  checks.
- Document npm installation, one-off execution, upgrades, and uninstallation.
- Include the changelog in the published package.
- Enforce LF checkouts on Windows so formatting checks agree across platforms.
- Resolve Windows package-manager shims to absolute paths during installation
  tests.

## 0.1.0 — 2026-10-24

First local release of Groovectl for Discogs (formerly Crateflow).

- Database search and Release, Master, Artist, and Label reads.
- Collection folders, listing, membership, add/update/remove, and valuation.
- Wantlist listing, add/update/remove, ratings, and notes.
- Marketplace statistics, known-listing details, and official fee reads.
- Optional tokens with stdin, environment, hidden prompts, and OS keyring
  storage.
- Table, JSON, JSONL, TSV, field selection, and paginated streaming output.
- Dry runs, confirmed removals, bounded GET retries, and sanitized diagnostics.
- Local/global npm installation under the `groovectl` command; Node.js 24+.

Pre-release review fixes:

- Validate output options before Collection/Wantlist mutation requests.
- Initialize the native keyring lazily for headless and anonymous usage.
- Map interactive prompt cancellation to exit code 10.
- Execute Windows package-manager and CLI shims through `cmd.exe`.
- Restore executable permissions after clean builds for linked Unix installs.
- Clarify that HTTP timeouts apply per attempt, not to the entire command.
- Upgrade Zod to a patched version for GHSA-mrhx-c7xc-m3w5.

Marketplace reads do not include monitoring, scheduling, notifications, or price
history. The package remains private until an npm publication is explicitly
prepared; this version does not publish to npm or create a GitHub release.
