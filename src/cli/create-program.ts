import {
  Command,
  InvalidArgumentError,
  type OutputConfiguration,
} from "commander";

import type { CliIo } from "./run-cli.js";
import { createReleaseCommand } from "./commands/release.js";
import { buildInfo, packageVersion } from "../version.js";

export function createProgram(io: CliIo): Command {
  const program = new Command();
  const output: OutputConfiguration = {
    writeOut: (text: string) => io.stdout.write(text),
    writeErr: (text: string) => io.stderr.write(text),
    outputError: (text: string, write: (text: string) => void) =>
      write(text.replace(/^error:/u, "CRATEFLOW_USAGE:")),
  };

  program
    .name("crateflow")
    .description("A script-friendly CLI for the Discogs API.")
    .version(packageVersion)
    .showHelpAfterError()
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
        `crateflow ${info.version} (${info.platform}/${info.arch}, ${info.nodeVersion})\n`,
      );
    });

  program.addCommand(createReleaseCommand(io));
  for (const command of program.commands) {
    configureCommandTree(command, output);
  }
  return program;
}

function configureCommandTree(
  command: Command,
  output: OutputConfiguration,
): void {
  command.exitOverride().configureOutput(output);
  for (const child of command.commands) {
    configureCommandTree(child, output);
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
