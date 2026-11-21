import { Command, type Argument, type Option } from "commander";

import { AppError } from "../../errors/app-error.js";
import { packageVersion } from "../../version.js";
import type { CliIo } from "../run-cli.js";

export interface OptionSchema {
  flags: string;
  description: string;
  required: boolean;
  choices: readonly string[] | null;
  defaultValue: unknown;
}

export interface ArgumentSchema {
  name: string;
  description: string;
  required: boolean;
  variadic: boolean;
}

export interface CommandSchema {
  path: string;
  description: string;
  arguments: ArgumentSchema[];
  options: OptionSchema[];
}

export interface CliSchemaDocument {
  name: string;
  version: string;
  description: string;
  conventions: {
    tokenOrder: readonly string[];
    outputFormats: readonly string[];
    errorFormats: readonly string[];
    safetyFlags: readonly string[];
    paginationFlags: readonly string[];
  };
  globalOptions: OptionSchema[];
  exitCodes: Record<string, string>;
  commands: CommandSchema[];
}

const conventions = {
  tokenOrder: [
    "--token-stdin",
    "DISCOGS_TOKEN",
    "--token (interactive prompt)",
    "OS keyring (auth login)",
  ],
  outputFormats: ["table", "json", "jsonl", "tsv"],
  errorFormats: ["text", "json"],
  safetyFlags: ["--dry-run", "--yes"],
  paginationFlags: ["--page", "--per-page", "--all", "--limit"],
} as const;

const exitCodes: Record<string, string> = {
  "0": "success",
  "2": "usage or validation error",
  "3": "authentication required or invalid",
  "4": "forbidden or website blocked",
  "5": "not found",
  "6": "rate limited",
  "7": "upstream or response schema error",
  "8": "network error",
  "10": "cancelled or confirmation required",
};

export function createSchemaCommand(io: CliIo, root: Command): Command {
  return new Command("schema")
    .description(
      "Output machine-readable JSON metadata for CLI commands, arguments, options, and exit codes.",
    )
    .argument(
      "[command...]",
      "Optional command path prefix to filter (for example: marketplace listings)",
    )
    .option(
      "--compact",
      "Emit compact single-line JSON with minimal command summaries.",
    )
    .action((prefix: string[], options: { compact?: boolean }) => {
      const { command: target, path } = resolveSubtree(root, prefix);
      const commands = collectCommands(
        target,
        path.slice(0, -1),
        path.length > 0,
      );
      if (options.compact === true) {
        const summary = {
          name: root.name(),
          version: packageVersion,
          exitCodes,
          commands: commands.map((entry) => ({
            path: entry.path,
            description: entry.description,
            args: entry.arguments.map((arg) => {
              const label = arg.variadic ? `${arg.name}...` : arg.name;
              return arg.required ? `<${label}>` : `[${label}]`;
            }),
            options: entry.options.map((opt) => opt.flags),
          })),
        };
        io.stdout.write(`${JSON.stringify(summary)}\n`);
        return;
      }
      const document: CliSchemaDocument = {
        name: root.name(),
        version: packageVersion,
        description: root.description(),
        conventions,
        globalOptions: root.options.map(serializeOption),
        exitCodes,
        commands,
      };
      io.stdout.write(`${JSON.stringify(document, null, 2)}\n`);
    });
}

function resolveSubtree(
  root: Command,
  prefix: readonly string[],
): { command: Command; path: string[] } {
  let current = root;
  const path: string[] = [];
  for (const segment of prefix) {
    const next = current.commands.find(
      (candidate) =>
        candidate.name() === segment || candidate.aliases().includes(segment),
    );
    if (next === undefined) {
      throw new AppError({
        kind: "not_found",
        code: "GROOVECTL_COMMAND_NOT_FOUND",
        message: `Unknown command path: ${prefix.join(" ")}.`,
        remediation:
          "Run `groovectl schema --compact` to list all available command paths.",
      });
    }
    path.push(next.name());
    current = next;
  }
  return { command: current, path };
}

function collectCommands(
  node: Command,
  ancestors: readonly string[],
  includeSelf: boolean,
): CommandSchema[] {
  const results: CommandSchema[] = [];
  const nextAncestors = includeSelf ? [...ancestors, node.name()] : [];
  if (includeSelf && node.commands.length === 0) {
    results.push(serializeCommand(node, nextAncestors));
    return results;
  }
  for (const child of node.commands) {
    if (child.commands.length === 0) {
      results.push(serializeCommand(child, [...nextAncestors, child.name()]));
    } else {
      results.push(...collectCommands(child, nextAncestors, true));
    }
  }
  return results;
}

function serializeCommand(
  command: Command,
  pathParts: readonly string[],
): CommandSchema {
  return {
    path: pathParts.join(" "),
    description: command.description(),
    arguments: command.registeredArguments.map(serializeArgument),
    options: command.options.map(serializeOption),
  };
}

function serializeArgument(argument: Argument): ArgumentSchema {
  return {
    name: argument.name(),
    description: argument.description,
    required: argument.required,
    variadic: argument.variadic,
  };
}

function serializeOption(option: Option): OptionSchema {
  return {
    flags: option.flags,
    description: option.description,
    required: option.mandatory,
    choices: option.argChoices ?? null,
    defaultValue: option.defaultValue ?? null,
  };
}
