# Changelog

## 0.2.0 — 2026-11-21

- Add AI & automation CLI ergonomics:
  `groovectl schema [command...] [--compact]` for offline machine-readable
  command introspection, global `--error-format json` /
  `GROOVECTL_ERROR_FORMAT=json` for structured stderr errors, global `--quiet`
  (`-q`), and early-stopping `--limit <count>` on paginated list commands.
- Expand pressing-identification database reads: enrich `release get` with
  `--currency`, `masterId`, `released`, `labels` + `catalogNumber`, `companies`,
  `identifiers` (barcode, matrix/runout), `tracklist`, `notes`, `community`
  stats, `lowestPrice`, `numForSale`, and format qty/text; add
  `release rating get|set|remove`; add official Discogs filter/sort options to
  `master versions` (`--media-format`, `--country`, `--label`, `--released`,
  `--sort`, `--sort-order`, plus `have`/`want` counts) and `artist releases`
  (`--sort`, `--sort-order`); include `masterId` and `barcodes` on `search`.
- Complete collection, wantlist, profile, and list management: add
  `collection folder get|create|rename|delete`, `collection fields`,
  `collection note set`, local `--query` filtering on `collection list` and
  `wantlist list`, `user profile [username]`, and `list ls` / `list get`.
- Complete Marketplace capabilities: add
  `marketplace price-suggestions <release-id>`,
  `marketplace inventory [username]`, `marketplace listing create|update|delete`
  (with `--dry-run`, `--yes`, grade normalization, and merge-on-update),
  `marketplace orders list|get|update|messages|message`, and
  `marketplace listings <release-id>` (best-effort website PJAX / `--html`
  reader with gzip/deflate/brotli decompression, `--sort`, `--limit`,
  `--verbose`, and seller/grade/price/rating filters).
- Accept empty Marketplace API shipping quotes (`{}`) as unknown rather than
  rejecting an otherwise valid listing, and allow `null` pagination links.
- Validate `--fields` and `--json`/`--format` conflicts before issuing API
  requests across read commands, including `--json --format table`.
- Return exit code 2 (`GROOVECTL_CONFIG_VALUE_INVALID`) when `config set`
  receives an invalid enum or out-of-range value instead of an unexpected error.
- Avoid a redundant `/oauth/identity` lookup on `search`, route `--verbose`
  diagnostics through the CLI stderr stream, and use the repository URL in the
  API `User-Agent`.
- Fix `collection value` currency parsing for prefixed dollar currencies (such
  as `CA$`, `A$`, `NZ$`, `MX$`, `R$`), ISO codes, and non-numeric placeholders.

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
