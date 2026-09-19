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

Resource commands support `--format table|json|jsonl|tsv` and `--json` as a
shortcut. List commands support `--page`, `--per-page`, and `--all`.

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

## Reliability

GET requests use bounded exponential-backoff retries for transient network and
Discogs 502/503/504 failures. A 429 response is retried only when Discogs sends
a `Retry-After` value within the configured safety limit. Cross-origin
pagination URLs are rejected.

## Security

Do not report vulnerabilities in public issues. See [SECURITY.md](SECURITY.md).

## License

Apache-2.0.
