# Crateflow for Discogs

Crateflow is a local-first, script-friendly command-line interface for the
official Discogs API. The MVP focuses on Database, Collection, and Wantlist
workflows.

> This application uses Discogs' API but is not affiliated with, sponsored or
> endorsed by Discogs. "Discogs" is a trademark of Zink Media, LLC.

## Local development

Requirements: Node.js 24 LTS and pnpm 10.

```sh
pnpm install
pnpm build
node dist/bin/crateflow.js --help
node dist/bin/crateflow.js release get 249504 --json
```

The package is intentionally marked private until the public repository and npm
package name are confirmed.

## Implemented commands

- `crateflow --help`
- `crateflow version [--json]`
- `crateflow auth login|status|logout`
- `crateflow search [query] [filters] [--all]`
- `crateflow release get <id>`
- `crateflow master get <id>` / `crateflow master versions <id>`
- `crateflow artist get <id>` / `crateflow artist releases <id>`
- `crateflow label get <id>` / `crateflow label releases <id>`
- `crateflow collection folders|list|contains|add|update|remove|value`
- `crateflow wantlist list|add|update|remove`
- `crateflow config get|set`

Resource commands support `--format table|json|jsonl|tsv` and `--json` as a
shortcut. List commands support `--page`, `--per-page`, and `--all`. Use the
global `--fields id,title,...` option to select and order output fields. JSONL
streams one record per line; JSON arrays are capped at 10,000 records to avoid
unbounded memory use.

## Collection and Wantlist

These commands always operate on the identity associated with the active token;
they do not accept an arbitrary username.

```sh
crateflow collection folders --json
crateflow collection list --folder 0 --sort added --sort-order desc --all --format jsonl
crateflow collection contains 249504 --json
crateflow collection add 249504 --folder 1 --dry-run --json
crateflow collection update 1 249504 123456 --rating 5 --dry-run
crateflow collection remove 1 249504 123456 --yes
crateflow collection value --json

crateflow wantlist list --all --format jsonl
crateflow wantlist add 249504 --rating 5 --notes "Find a clean copy" --dry-run
crateflow wantlist update 249504 --notes "Prefer first pressing"
crateflow wantlist remove 249504 --yes
```

`--dry-run` still authenticates and resolves the current username, but sends no
write request. Destructive `remove` commands prompt interactively; automation
must pass `--yes`. Non-interactive removal without `--yes` exits with code 10.

## Authentication

Public Database reads work anonymously. Database search requires a Discogs User
Token. Token resolution uses this order:

1. `--token-stdin`
2. `DISCOGS_TOKEN`
3. an explicit hidden prompt from `--token`
4. the OS credential store populated by `auth login`

```sh
# Hidden interactive prompt; validates before saving to Keychain/keyring.
node dist/bin/crateflow.js --token auth login

# Temporary token for automation. The token is not persisted.
printf '%s\n' "$DISCOGS_TOKEN" \
  | node dist/bin/crateflow.js --token-stdin search "Kind of Blue" --type release --json

node dist/bin/crateflow.js auth status --json
node dist/bin/crateflow.js auth logout
```

`auth logout` only deletes the locally stored credential; revoke the token in
Discogs account settings when it should no longer remain valid.

## Configuration

Crateflow stores non-secret settings in the platform-standard user config
directory. Tokens are never written to this file.

```sh
crateflow config get --json
crateflow config set format jsonl
crateflow config set timeoutMs 45000
crateflow config set maxRateLimitWaitMs 60000
```

Supported keys are `format`, `color`, `locale`, `timeoutMs`, and
`maxRateLimitWaitMs`. `format`, request timeout, and maximum accepted
`Retry-After` delay are active in P0. `--timeout` overrides the stored timeout
for one invocation. `--verbose` writes sanitized method/path/status/timing
diagnostics to stderr and never includes tokens, query values, or request
bodies.

## Reliability

GET requests use bounded exponential-backoff retries for transient network and
Discogs 502/503/504 failures. A 429 response is retried only when Discogs sends
a `Retry-After` value within the configured safety limit. Cross-origin
pagination URLs are rejected. Write requests are never automatically retried.
Rate-limit response headers are used to pace subsequent requests, and broken
pipes exit cleanly for shell pipelines.

Stable exit-code classes include usage/validation `2`, authentication `3`,
forbidden `4`, not found `5`, rate limit `6`, upstream `7`, network `8`, and
cancelled/confirmation-required `10`.

## Security

Do not report vulnerabilities in public issues. See [SECURITY.md](SECURITY.md).

## License

Apache-2.0.
