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

## Implemented in M0

- `crateflow --help`
- `crateflow version [--json]`
- `crateflow release get <id> [--json|--format table|json]`

## Security

Do not report vulnerabilities in public issues. See [SECURITY.md](SECURITY.md).

## License

Apache-2.0.
