# Groovectl for Discogs

A script-friendly Discogs CLI for exploring releases, managing your collection
and wantlist, and reading Marketplace data.

> This application uses Discogs' API but is not affiliated with, sponsored or
> endorsed by Discogs. "Discogs" is a trademark of Zink Media, LLC.

## Installation

Requires Node.js 24 or newer and npm. End users do not need pnpm, TypeScript, or
a source checkout.

```sh
npm install --global groovectl
groovectl --help
groovectl version --json
groovectl release get 249504 --json
```

For a one-off invocation without a global installation:

```sh
npm exec --package=groovectl -- groovectl --help
```

Upgrade or uninstall:

```sh
npm install --global groovectl@latest
npm uninstall --global groovectl
```

Global commands must be on PATH. If npm reports a permissions error, use a
user-owned Node.js installation rather than changing system directory
permissions. Discogs authentication is separate from npm installation; use
`groovectl --token auth login` when you want to save a Discogs User Token.

## Local development

Requirements: Node.js 24 LTS and pnpm 10.

```sh
pnpm install
pnpm build
npm install --global .

groovectl --help
groovectl release get 249504 --json
```

Run the installation commands in the project directory. After installation,
`groovectl` works from any directory as long as npm's global executable
directory is on PATH. This local installation links to the checkout, so rebuild
with `pnpm build` after changing source code and keep the checkout in place.

A built tarball can also be installed with
`npm install -g /path/to/groovectl-0.1.1.tgz`; recipients need Node.js 24+, but
do not need pnpm or a TypeScript compiler.

For local development without installing, use `pnpm start -- --help` or
`node dist/bin/groovectl.js --help` after building.

## Rename from Crateflow

The package and executable are now `groovectl` (Groovectl for Discogs). The
local checkout folder does not need to be renamed. Reinstall from the checkout
to register the new command. If an older global `crateflow` package is
installed, you can remove it with `npm uninstall -g crateflow` after verifying
`groovectl`.

Existing settings and saved tokens remain in the original `crateflow` config
directory and OS credential-store namespace; the rename does not migrate or
delete them. The `DISCOGS_TOKEN` environment variable and token options are
unchanged. Error prefixes now use `GROOVECTL_`; scripts matching the old
`CRATEFLOW_` errors need updating. Build/test environment variables use
`GROOVECTL_`, with legacy `CRATEFLOW_` aliases accepted for compatibility.

## Implemented commands

- `groovectl --help`
- `groovectl version [--json]`
- `groovectl auth login|status|logout`
- `groovectl search [query] [filters] [--all]`
- `groovectl release get <id>`
- `groovectl master get <id>` / `groovectl master versions <id>`
- `groovectl artist get <id>` / `groovectl artist releases <id>`
- `groovectl label get <id>` / `groovectl label releases <id>`
- `groovectl collection folders|list|contains|add|update|remove|value`
- `groovectl wantlist list|add|update|remove`
- `groovectl config get|set`
- `groovectl marketplace stats <release-id> [--currency <code>]`
- `groovectl marketplace listing get <listing-id> [--currency <code>]`
- `groovectl marketplace fee <price> [--currency <code>]`

Resource commands support `--format table|json|jsonl|tsv` and `--json` as a
shortcut. Search uses `--output` for output format because its `--format` flag
filters the release medium (for example Vinyl). List commands support `--page`,
`--per-page`, and `--all`. Use the global `--fields id,title,...` option to
select and order output fields. JSONL streams one record per line; JSON arrays
are capped at 10,000 records to avoid unbounded memory use.

## Collection and Wantlist

These commands always operate on the identity associated with the active token;
they do not accept an arbitrary username.

```sh
groovectl collection folders --json
groovectl collection list --folder 0 --sort added --sort-order desc --all --format jsonl
groovectl collection contains 249504 --json
groovectl collection add 249504 --folder 1 --dry-run --json
groovectl collection update 1 249504 123456 --rating 5 --dry-run
groovectl collection remove 1 249504 123456 --yes
groovectl collection value --json

groovectl wantlist list --all --format jsonl
groovectl wantlist add 249504 --rating 5 --notes "Find a clean copy" --dry-run
groovectl wantlist update 249504 --notes "Prefer first pressing"
groovectl wantlist remove 249504 --yes
```

`--dry-run` still authenticates and resolves the current username, but sends no
write request. Destructive `remove` commands prompt interactively; automation
must pass `--yes`. Non-interactive removal without `--yes` exits with code 10.
Mutation commands validate output format and selected fields before sending
requests, so an invalid output option cannot accidentally modify account data.

## Marketplace reads

These commands make one-shot reads of the official API. Token input remains
optional, and the usual token resolution applies without a separate identity
lookup. In live verification on 2026-10-11, stats worked anonymously, while
listing and fee requests returned HTTP 401 without a token. When the API
requires authentication, an anonymous request exits with
`GROOVECTL_AUTH_REQUIRED` and instructions for supplying a token. An HTTP 401
with a supplied token remains `GROOVECTL_AUTH_INVALID`; the CLI does not
silently discard invalid credentials.

```sh
groovectl marketplace stats 249504 --currency USD --json
# Supply a token when required (hidden prompt); auth login also supports reuse.
# Replace the example with a known listing ID from a Discogs item URL.
groovectl --token marketplace listing get 123456789 --currency EUR --json
groovectl --token marketplace fee 45.00 --currency USD --json
groovectl marketplace stats 249504 --fields releaseId,lowestPrice,numForSale --format tsv
```

All three commands support table, JSON, JSONL, TSV, and `--fields` with
top-level output field names (for example `price` or `seller`, not
`price.value`). Monetary values are `{ value, currency }` objects. Missing
prices/counts remain `null` in JSON/JSONL; table and TSV display null as an
empty value. No-stock and blocked releases are successful results. A missing
listing is a not-found error.

Supported currencies: USD, GBP, EUR, CAD, AUD, JPY, CHF, MXN, BRL, NZD, SEK,
ZAR. Omitting `--currency` leaves the choice to Discogs: stats use USD
anonymously or the authenticated buyer's currency; fees default to USD.
Groovectl never converts currencies or calculates fees locally. Fee prices
accept non-negative decimal notation, not scientific notation or currency
symbols.

Stats contain the lowest **item price**, not a delivered total including
shipping and taxes. The official API does not document an endpoint to list every
offer for a release; `listing get` needs an existing listing ID. Listing output
uses `release.description` and normalizes original price currency and seller
rating. Only a stable public subset is exposed, including when the token belongs
to the listing owner; private inventory fields and cart state are omitted.

There is no watch mode, scheduler, notification service, price history, or
Marketplace cache/state file. Data is read for the current invocation and is not
persisted or sent to telemetry. Tests use synthetic responses. Data provided by
Discogs. See the
[official API documentation](https://www.discogs.com/developers#page:marketplace)
and
[API Terms of Use](https://support.discogs.com/hc/en-us/articles/360009334593-API-Terms-of-Use).

## Authentication

Public Database reads work anonymously. Database search requires a Discogs User
Token. Token resolution uses this order:

1. `--token-stdin`
2. `DISCOGS_TOKEN`
3. an explicit hidden prompt from `--token`
4. the OS credential store populated by `auth login`

```sh
# Hidden interactive prompt; validates before saving to Keychain/keyring.
groovectl --token auth login

# Temporary token for automation. The token is not persisted.
printf '%s\n' "$DISCOGS_TOKEN" \
  | groovectl --token-stdin search "Kind of Blue" --type release --json

groovectl auth status --json
groovectl auth logout
```

`auth logout` only deletes the locally stored credential; revoke the token in
Discogs account settings when it should no longer remain valid.

## Configuration

Groovectl stores non-secret settings in the platform-standard user config
directory. Tokens are never written to this file.

```sh
groovectl config get --json
groovectl config set format jsonl
groovectl config set timeoutMs 45000
groovectl config set maxRateLimitWaitMs 60000
```

Supported keys are `format`, `color`, `locale`, `timeoutMs`, and
`maxRateLimitWaitMs`. `format`, request timeout, and maximum accepted
`Retry-After` delay are active in P0. `--timeout` overrides the stored timeout
for each HTTP attempt in one invocation; retries and rate-limit waits can make
the command's total duration longer. `--verbose` writes sanitized
method/path/status/timing diagnostics to stderr and never includes tokens, query
values, or request bodies.

## Reliability

GET requests use bounded exponential-backoff retries for transient network and
Discogs 502/503/504 failures. A 429 response is retried only when Discogs sends
a `Retry-After` value within the configured safety limit. Cross-origin
pagination URLs are rejected. Write requests are never automatically retried.
Rate-limit response headers are used to pace subsequent requests, and broken
pipes exit cleanly for shell pipelines. The native credential store is
initialized only when accessed; missing keyring services do not prevent help,
version, config, or explicitly supplied tokens from working. Cancelling an
interactive prompt exits with code 10.

Stable exit-code classes include usage/validation `2`, authentication `3`,
forbidden `4`, not found `5`, rate limit `6`, upstream `7`, network `8`, and
cancelled/confirmation-required `10`.

## Security

Do not report vulnerabilities in public issues. See [SECURITY.md](SECURITY.md).

## Publishing

Maintainers need Node.js 24+, pnpm 10, and npm publishing access to `groovectl`.
The package name and version in `package.json` must match the release tag.

1. Update the version and changelog, commit the release, and wait for all three
   platform CI jobs to pass for that exact commit.
2. Run `pnpm release:check` and `pnpm verify:package` from a clean checkout.
3. Authenticate with `npm login --registry=https://registry.npmjs.org` if
   needed.
4. Run `npm publish --dry-run`, inspect the payload, then `npm publish`.
   Publishing runs the release checks and builds the distributable
   automatically.
5. Verify the published version using `npm view groovectl version`, install it
   into an isolated directory, and exercise `groovectl version --json` and help.
6. Create the matching `vX.Y.Z` tag only after the registry publish succeeds.

The existing GitHub workflow validates changes; it does not publish packages.
The first npm publication uses interactive npm authentication. Future automated
publishing can use npm Trusted Publishing with a specifically authorized GitHub
workflow, without storing a long-lived npm publishing token.

## License

Apache-2.0.
