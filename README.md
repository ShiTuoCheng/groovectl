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
`npm install -g /path/to/groovectl-0.2.0.tgz`; recipients need Node.js 24+, but
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
- `groovectl schema [command...] [--compact]`
- `groovectl auth login|status|logout`
- `groovectl config get|set`
- `groovectl search [query] [filters] [--all] [--limit <n>]`
- `groovectl release get <id> [--currency <code>]`
- `groovectl release rating get|set|remove <id>`
- `groovectl master get <id>` /
  `groovectl master versions <id> [--country ...] [--media-format ...] [--label ...] [--released ...] [--sort ...]`
- `groovectl artist get <id>` / `groovectl artist releases <id> [--sort ...]`
- `groovectl label get <id>` / `groovectl label releases <id>`
- `groovectl collection folders|folder|fields|note|list|contains|add|update|remove|value`
- `groovectl wantlist list|add|update|remove`
- `groovectl user profile [username]`
- `groovectl list ls [username]` / `groovectl list get <list-id>`
- `groovectl marketplace stats <release-id> [--currency <code>]`
- `groovectl marketplace price-suggestions <release-id>`
- `groovectl marketplace listings <release-id> [filters] [--sort <order>] [--limit <n>] [--html <file>]`
- `groovectl marketplace inventory [username] [--status ...] [--sort ...]`
- `groovectl marketplace listing get|create|update|delete`
- `groovectl marketplace orders list|get|update|messages|message`
- `groovectl marketplace fee <price> [--currency <code>]`

Resource commands support `--format table|json|jsonl|tsv` and `--json` as a
shortcut. Search uses `--output` for output format because its `--format` flag
filters the release medium (for example Vinyl); `master versions` uses
`--media-format` to filter release medium alongside `--format` for output. List
commands support `--page`, `--per-page`, `--all`, and `--limit` (stopping
pagination as soon as the requested record count is reached). Use global
`--fields id,title,...` to select and order output fields, `--quiet` (`-q`) to
suppress informational stderr notices, and `--error-format json` (or
`GROOVECTL_ERROR_FORMAT=json`) for structured JSON errors on stderr. JSONL
streams one record per line; JSON arrays are capped at 10,000 records to avoid
unbounded memory use.

## Identifying specific pressings

`release get <id>` returns full pressing-identification details without opening
the Discogs website: `masterId`, `released`, `formats` (including quantity and
format text such as `180g` or `Gatefold`), `labels` with `catalogNumber`,
`companies` (pressed/mastered by), `identifiers` (barcode, matrix/runout
etchings), `tracklist`, `notes`, `community` (`have`, `want`, rating),
`lowestPrice`, and `numForSale`.

```sh
# 1. Search by catalog number, barcode, or title/artist
groovectl search --catno "25AP 755" --type release --json

# 2. Narrow down a master release to a specific pressing
groovectl master versions 5460 --country Japan --media-format Vinyl \
  --released 1978 --sort released --sort-order asc --limit 10 --json

# 3. Inspect matrix/runout, barcode, tracklist, notes, and demand
groovectl release get 249504 --currency USD --json
groovectl release rating get 249504 --json
groovectl release rating set 249504 5 --dry-run --json
```

## Collection, Wantlist, Profile, and Lists

Collection and Wantlist commands always operate on the identity associated with
the active token; they do not accept an arbitrary username. `user profile` and
`list ls` default to the authenticated user when `[username]` is omitted and can
read public profiles/lists when a username is given.

```sh
groovectl collection folders --json
groovectl collection folder create "Japanese Pressings" --dry-run --json
groovectl collection folder rename 2 "Japan OBI Vinyl" --json
groovectl collection folder delete 3 --yes --json

# Inspect custom field IDs (e.g. Media Condition, Sleeve Condition, Notes)
groovectl collection fields --json
groovectl collection note set 1 249504 123456 1 "Very Good Plus (VG+)" --dry-run --json

# Filter locally across read pages by title, artist, label, catno, or notes
groovectl collection list --folder 0 --all --query "OBI" --limit 20 --json
groovectl collection contains 249504 --json
groovectl collection add 249504 --folder 1 --dry-run --json
groovectl collection update 1 249504 123456 --rating 5 --dry-run
groovectl collection remove 1 249504 123456 --yes
groovectl collection value --json

groovectl wantlist list --all --query "Blue Note" --limit 20 --json
groovectl wantlist add 249504 --rating 5 --notes "Find a clean copy" --dry-run
groovectl wantlist update 249504 --notes "Prefer first pressing"
groovectl wantlist remove 249504 --yes

groovectl user profile --json
groovectl list ls --json
groovectl list get 123456 --json
```

`--dry-run` still authenticates and resolves the current username, but sends no
write request. Destructive `remove` and `delete` commands prompt interactively;
automation must pass `--yes`. Non-interactive removal without `--yes` exits with
code 10. Read and mutation commands validate output format and selected fields
before sending requests.

## Marketplace

The official API commands cover release statistics (`stats`), condition-based
market price suggestions (`price-suggestions`), seller inventories
(`inventory`), individual listings (`listing get|create|update|delete`), orders
(`orders list|get|update|messages|message`), and selling fees (`fee`).

```sh
# Release market valuation
groovectl marketplace stats 249504 --currency USD --json
groovectl marketplace price-suggestions 249504 --json

# Browse any seller's shop (public) or your own inventory (omit username)
groovectl marketplace inventory some-record-shop --status "For Sale" --sort price --sort-order asc --limit 25 --json
groovectl marketplace inventory --all --format jsonl

# Inspect or manage individual listings (create defaults to Draft; update merges existing fields)
groovectl marketplace listing get 123456789 --currency EUR --json
groovectl marketplace listing create 249504 --condition VG+ --sleeve-condition VG+ --price 45.00 --dry-run --json
groovectl marketplace listing update 123456789 --price 39.99 --dry-run --json
groovectl marketplace listing delete 123456789 --yes --json

# Inspect and manage seller orders and fees
groovectl marketplace orders list --status "Payment Received" --json
groovectl marketplace orders get 12345-1 --json
groovectl marketplace orders messages 12345-1 --json
groovectl marketplace orders update 12345-1 --status Shipped --dry-run --json
groovectl marketplace orders message 12345-1 --message "Shipped today" --dry-run --json
groovectl marketplace fee 45.00 --currency USD --json
```

For `stats`, `listing get`, and `fee`, token input remains optional, and the
usual token resolution applies without a separate identity lookup. When the API
requires authentication, an anonymous request exits with
`GROOVECTL_AUTH_REQUIRED` and instructions for supplying a token. An HTTP 401
with a supplied token remains `GROOVECTL_AUTH_INVALID`; the CLI does not
silently discard invalid credentials. An empty `shipping_price: {}` is treated
as an unknown shipping quote (`shippingPrice: null`), not a zero charge.
`price-suggestions` requires an authenticated token for an account with Discogs
seller settings configured.

All commands support table, JSON, JSONL, TSV, and `--fields` with top-level
output field names (for example `price` or `seller`, not `price.value`).
Monetary values are `{ value, currency }` objects. Missing prices/counts remain
`null` in JSON/JSONL; table and TSV display null as an empty value. No-stock and
blocked releases are successful results. A missing listing is a not-found error.

Supported currencies: USD, GBP, EUR, CAD, AUD, JPY, CHF, MXN, BRL, NZD, SEK,
ZAR. Omitting `--currency` leaves the choice to Discogs: stats use USD
anonymously or the authenticated buyer's currency; fees default to USD.
Groovectl never converts currencies or calculates fees locally. Fee prices
accept non-negative decimal notation, not scientific notation or currency
symbols.

Stats contain the lowest **item price**, not a delivered total including
shipping and taxes. The official API does not document an endpoint to list every
offer for a release; `listing get` needs an existing listing ID. Public
`listing get` output uses `release.description` and strips private owner-only
fields and cart state. `listing update` reads the existing listing internally so
partial updates (such as changing only `--price`) preserve other listing fields.

There is no watch mode, scheduler, notification service, price history, or
Marketplace cache/state file. Data is read for the current invocation and is not
persisted or sent to telemetry. Tests use synthetic responses. Data provided by
Discogs. See the
[official API documentation](https://www.discogs.com/developers#page:marketplace)
and
[API Terms of Use](https://support.discogs.com/hc/en-us/articles/360009334593-API-Terms-of-Use).

### Find offers by release (website reader)

`marketplace listings` discovers actual item links from a release's English
Marketplace HTML page using its PJAX request (`_pjax=#pjax_container`,
`X-PJAX: true`, `X-PJAX-Container: #pjax_container`). Both full saved pages and
PJAX fragments are supported. It uses the website, **not a release-listings
API**. Website access is best-effort: Discogs may return HTTP 403 or a challenge
even when API access works. The command reports that failure instead of
returning an empty inventory; it does not retry, bypass challenges, use API
tokens or cookies, or launch a browser. Website requests use Node's HTTPS
client; API requests continue using their existing transport. A PJAX read of
release 2980551 returned 22 offers on 2026-10-25, matching the API's sale count.
This undocumented website route may change independently of the public API.

```sh
groovectl --quiet marketplace listings 2980551 --ships-from "United Kingdom" \
  --currency GBP --min-media "VG+" --min-sleeve "VG+" \
  --max-price 150 --min-seller-rating 99 --sort price-asc --all --limit 10 --json

# Alternatively save the English release Marketplace page as HTML in a browser.
groovectl marketplace listings 2117312 --html "/path/to/saved-page.html" \
  --ships-from "United Kingdom" --min-media "VG+" --json
```

The default reads one page (50 offers); `--page`, `--per-page` (max 100),
`--all`, `--limit`, and `--sort` (`price-asc`, `price-desc`, `listed-desc`,
`listed-asc`, `condition-desc`, `condition-asc`) are supported for live reads.
`--all` reads pages serially, with a 100-page ceiling; `--limit` stops fetching
further pages once enough matching offers are emitted; a failed later page exits
nonzero. JSON buffers the result until completion; JSONL can contain partial
rows before an error. `--html` reads only one supplied page and cannot be
combined with `--page`, `--all`, or `--sort`. Local HTML is read without network
access, is limited to 10 MiB, and has unknown freshness. Unrecognized markup,
wrong releases, inconsistent pagination, and challenge/login pages are errors
rather than zero offers.

Filters apply to the pages read. `--ships-from` filters the **seller's**
country, not the release's country or the shipping destination. `--currency`
filters the original item currency; it does not request conversion.
`--max-price` requires `--currency` and excludes shipping/tax. Grade choices,
from lowest to highest, are `P`, `F`, `G`, `G+`, `VG`, `VG+`, `NM`, `M`.
Unknown/generic sleeve grades and unknown ratings do not pass a requested
minimum. Offers marked unavailable on the page are excluded unless
`--include-unavailable` is supplied.

Each result includes `marketplaceUrl`, item `price`, `condition`,
`sleeveCondition`, `comments`, `shipsFrom`, `seller` (username, positive
feedback percentage, feedback count), `shippingText`, `availability`, `source`,
`sourceUrl`, and `readAt`. `readAt` is the time the CLI parsed the page, not the
time a saved HTML snapshot was captured. `shippingText` is an unverified page
quote for the page's destination, which may be unknown; it is not added to the
price. Grades and playback notes are seller claims, and these offers have not
been checked against `listing get`. Use that existing command with a candidate
ID for an independent API check when access permits. No cart state, private
account fields, or credentials are output.

## AI agent & automation usage

Groovectl is designed as a pure Discogs CLI that AI agents and scripts can call
reliably without scraping web pages:

- **Discover commands offline**: run `groovectl schema --compact` (or
  `groovectl schema marketplace`) for live machine-readable JSON metadata of
  commands, arguments, options, choices, safety flags, and exit codes.
- **Structured errors**: pass `--error-format json` or set
  `GROOVECTL_ERROR_FORMAT=json` so every usage, auth, rate-limit, or upstream
  error is emitted as a single JSON object on stderr
  (`{ error: { code, kind, message, remediation, httpStatus, exitCode } }`).
- **Clean output & token budget**: combine `--quiet`, `--json` (or
  `--format jsonl`), `--fields`, and `--limit` to keep stdout clean and bounded.
- **Safe non-interactive mutations**: non-TTY invocations never hang on prompts;
  preview every write with `--dry-run`, and pass `--yes` only after explicit
  confirmation for deletions.

```sh
# Recommended environment for AI tool callers
export GROOVECTL_ERROR_FORMAT=json

groovectl schema --compact
groovectl --quiet search "Kind of Blue" --type master --limit 5 --json
groovectl --quiet master versions 5460 --country Japan --media-format Vinyl --limit 10 --json
groovectl --quiet release get 249504 --fields id,title,labels,identifiers,notes,community,lowestPrice,numForSale --json
groovectl --quiet marketplace price-suggestions 249504 --json
groovectl --quiet marketplace listings 249504 --min-media VG+ --limit 10 --json
```

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
