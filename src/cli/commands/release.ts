import { Command, Option } from "commander";

import type { CliIo } from "../run-cli.js";
import { positiveInteger } from "../create-program.js";
import { DatabaseService } from "../../app/database-service.js";
import { DiscogsClient } from "../../discogs/client.js";
import { createRenderer, type OutputFormat } from "../../output/renderer.js";
import { packageVersion } from "../../version.js";
import { AppError } from "../../errors/app-error.js";

const supportedFormats = ["table", "json"] as const;

export function createReleaseCommand(io: CliIo): Command {
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
      async (id: number, options: { format: OutputFormat; json?: boolean }) => {
        if (options.json === true && options.format !== "table") {
          throw new AppError({
            kind: "usage",
            code: "CRATEFLOW_OUTPUT_CONFLICT",
            message: "--json cannot be combined with --format.",
          });
        }

        const format = options.json === true ? "json" : options.format;
        const client = new DiscogsClient({
          baseUrl: resolveBaseUrl(process.env),
          userAgent: `Crateflow/${packageVersion} (local development)`,
        });
        const service = new DatabaseService(client);
        const result = await service.getRelease(id);
        createRenderer(format, io.stdout).renderOne(result);
      },
    );

  return release;
}

function resolveBaseUrl(env: NodeJS.ProcessEnv): string {
  const override = env.CRATEFLOW_API_BASE_URL;
  if (override === undefined) {
    return "https://api.discogs.com";
  }
  if (env.NODE_ENV !== "test") {
    throw new AppError({
      kind: "usage",
      code: "CRATEFLOW_UNSAFE_BASE_URL",
      message: "CRATEFLOW_API_BASE_URL is only allowed when NODE_ENV=test.",
    });
  }
  return override;
}
