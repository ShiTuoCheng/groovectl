import {
  Command,
  InvalidArgumentError,
  Option,
  type OutputConfiguration,
} from "commander";

import type { CliIo } from "./run-cli.js";
import type { ErrorFormat } from "./global-options.js";
import { createAuthCommand } from "./commands/auth.js";
import { createArtistCommand } from "./commands/artist.js";
import { createLabelCommand } from "./commands/label.js";
import { createListCommand } from "./commands/list.js";
import { createMasterCommand } from "./commands/master.js";
import { createReleaseCommand } from "./commands/release.js";
import { createSchemaCommand } from "./commands/schema.js";
import { createSearchCommand } from "./commands/search.js";
import { createConfigCommand } from "./commands/config.js";
import { createCollectionCommand } from "./commands/collection.js";
import { createUserCommand } from "./commands/user.js";
import { createWantlistCommand } from "./commands/wantlist.js";
import { createMarketplaceCommand } from "./commands/marketplace.js";
import { CliRuntime, type RuntimeDependencies } from "./runtime.js";
import { buildInfo, packageVersion } from "../version.js";

export function createProgram(
  io: CliIo,
  dependencies: RuntimeDependencies = {},
  errorFormat: ErrorFormat = "text",
): Command {
  const program = new Command();
  const runtime = new CliRuntime({
    stderr: io.stderr,
    errorFormat,
    ...dependencies,
  });
  const output: OutputConfiguration = {
    writeOut: (text: string) => io.stdout.write(text),
    writeErr: (text: string) => {
      if (errorFormat === "json") return;
      io.stderr.write(text);
    },
    outputError: (text: string, write: (text: string) => void) => {
      if (errorFormat === "json") return;
      write(text.replace(/^error:/u, "GROOVECTL_USAGE:"));
    },
  };

  program
    .name("groovectl")
    .description("A script-friendly CLI for the Discogs API.")
    .version(packageVersion)
    .option("--token", "Prompt securely for a temporary Discogs User Token.")
    .option("--token-stdin", "Read a temporary Discogs User Token from stdin.")
    .option("--fields <fields>", "Comma-separated output fields.")
    .option("--no-color", "Disable colored output.")
    .option(
      "--timeout <milliseconds>",
      "HTTP timeout per request attempt, in milliseconds.",
      positiveInteger,
    )
    .option("--verbose", "Write sanitized request diagnostics to stderr.")
    .option("-q, --quiet", "Suppress informational notices on stderr.")
    .addOption(
      new Option(
        "--error-format <format>",
        "Error output format on stderr (also configurable via GROOVECTL_ERROR_FORMAT).",
      )
        .choices(["text", "json"])
        .default("text"),
    )
    .showHelpAfterError(errorFormat !== "json")
    .configureOutput(output);

  program
    .command("version")
    .description("Show version and runtime information.")
    .option("--json", "Output a JSON document.")
    .action((options: { json?: boolean }) => {
      const info = buildInfo();
      if (options.json === true) {
        io.stdout.write(`${JSON.stringify(info, null, 2)}\n`);
        return;
      }

      io.stdout.write(
        `groovectl ${info.version} (${info.platform}/${info.arch}, ${info.nodeVersion})\n`,
      );
    });

  program.addCommand(createAuthCommand(io, runtime));
  program.addCommand(createConfigCommand(io, runtime));
  program.addCommand(createSearchCommand(io, runtime));
  program.addCommand(createReleaseCommand(io, runtime));
  program.addCommand(createMasterCommand(io, runtime));
  program.addCommand(createArtistCommand(io, runtime));
  program.addCommand(createLabelCommand(io, runtime));
  program.addCommand(createCollectionCommand(io, runtime));
  program.addCommand(createWantlistCommand(io, runtime));
  program.addCommand(createUserCommand(io, runtime));
  program.addCommand(createListCommand(io, runtime));
  program.addCommand(createMarketplaceCommand(io, runtime));
  program.addCommand(createSchemaCommand(io, program));
  for (const command of program.commands) {
    configureCommandTree(command, output, errorFormat !== "json");
  }
  return program;
}

function configureCommandTree(
  command: Command,
  output: OutputConfiguration,
  showHelpAfterError: boolean,
): void {
  command
    .exitOverride()
    .showHelpAfterError(showHelpAfterError)
    .configureOutput(output);
  for (const child of command.commands) {
    configureCommandTree(child, output, showHelpAfterError);
  }
}

export function positiveInteger(value: string): number {
  const parsed = Number.parseInt(value, 10);
  if (
    !Number.isSafeInteger(parsed) ||
    parsed <= 0 ||
    String(parsed) !== value
  ) {
    throw new InvalidArgumentError("expected a positive integer");
  }
  return parsed;
}

export function nonNegativeInteger(value: string): number {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isSafeInteger(parsed) || parsed < 0 || String(parsed) !== value) {
    throw new InvalidArgumentError("expected a non-negative integer");
  }
  return parsed;
}

export function rating(value: string): number {
  const parsed = nonNegativeInteger(value);
  if (parsed > 5)
    throw new InvalidArgumentError("expected a rating from 0 to 5");
  return parsed;
}

export function nonEmptyText(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new InvalidArgumentError("expected a non-empty value");
  }
  return trimmed;
}
