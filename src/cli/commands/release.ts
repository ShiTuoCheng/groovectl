import { Command, Option } from "commander";

import type { CliIo } from "../run-cli.js";
import { positiveInteger } from "../create-program.js";
import { tokenRequestFor } from "../global-options.js";
import type { CliRuntime } from "../runtime.js";
import { DatabaseService } from "../../app/database-service.js";
import { createRenderer, type OutputFormat } from "../../output/renderer.js";
import { AppError } from "../../errors/app-error.js";

const supportedFormats = ["table", "json", "jsonl", "tsv"] as const;

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

        const format = options.json === true ? "json" : options.format;
        const resolved = await runtime.tokens.resolve(
          tokenRequestFor(command, "token_optional"),
        );
        const client = runtime.client(resolved?.token);
        const service = new DatabaseService(client);
        const result = await service.getRelease(id);
        createRenderer(format, io.stdout).renderOne(result);
      },
    );

  return release;
}
