import { Command, Option } from "commander";

import type { CliIo } from "../run-cli.js";
import { positiveInteger } from "../create-program.js";
import { fieldsFor, tokenRequestFor } from "../global-options.js";
import type { CliRuntime } from "../runtime.js";
import { DatabaseService } from "../../app/database-service.js";
import type { OutputFormat } from "../../output/renderer.js";
import { renderRecord } from "../../output/records.js";
import type { Release } from "../../domain/release.js";
import { AppError } from "../../errors/app-error.js";

const supportedFormats = ["table", "json", "jsonl", "tsv"] as const;
const releaseColumns = [
  { key: "id", value: (item: Release) => item.id },
  { key: "title", value: (item: Release) => item.title },
  { key: "artists", value: (item: Release) => item.artists },
  { key: "year", value: (item: Release) => item.year },
  { key: "country", value: (item: Release) => item.country },
  { key: "formats", value: (item: Release) => item.formats },
  { key: "genres", value: (item: Release) => item.genres },
  { key: "styles", value: (item: Release) => item.styles },
  { key: "url", value: (item: Release) => item.url },
] as const;

export function createReleaseCommand(io: CliIo, runtime: CliRuntime): Command {
  const release = new Command("release").description("Read Discogs releases.");

  release
    .command("get")
    .description("Get a release by Discogs release ID.")
    .argument("<id>", "Discogs release ID", positiveInteger)
    .addOption(
      new Option("--format <format>", "Output format")
        .choices([...supportedFormats])
        .default("table"),
    )
    .option("--json", "Shortcut for --format json.")
    .action(
      async (
        id: number,
        options: { format: OutputFormat; json?: boolean },
        command: Command,
      ) => {
        if (options.json === true && options.format !== "table") {
          throw new AppError({
            kind: "usage",
            code: "CRATEFLOW_OUTPUT_CONFLICT",
            message: "--json cannot be combined with --format.",
          });
        }

        const format = await runtime.formatFor(
          command,
          options.format,
          options.json,
        );
        const resolved = await runtime.tokens.resolve(
          tokenRequestFor(command, "token_optional"),
        );
        const client = await runtime.clientFor(command, resolved?.token);
        const service = new DatabaseService(client);
        const result = await service.getRelease(id);
        renderRecord(
          result,
          format,
          releaseColumns,
          io.stdout,
          fieldsFor(command),
        );
      },
    );

  return release;
}
