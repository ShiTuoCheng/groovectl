import { CommanderError } from "commander";

import { createProgram } from "./create-program.js";
import type { ErrorFormat } from "./global-options.js";
import type { RuntimeDependencies } from "./runtime.js";
import { asAppError, exitCodeForError } from "../errors/app-error.js";

export interface CliIo {
  stdout: Pick<NodeJS.WriteStream, "write">;
  stderr: Pick<NodeJS.WriteStream, "write">;
}

const defaultIo: CliIo = {
  stdout: process.stdout,
  stderr: process.stderr,
};

export async function runCli(
  argv: readonly string[],
  io: CliIo = defaultIo,
  dependencies: RuntimeDependencies = {},
): Promise<number> {
  const errorFormat = resolveErrorFormat(argv, dependencies.env ?? process.env);
  const program = createProgram(io, dependencies, errorFormat);
  program.exitOverride();

  try {
    await program.parseAsync([...argv], { from: "user" });
    return 0;
  } catch (error: unknown) {
    if (error instanceof CommanderError) {
      if (error.exitCode === 0) return 0;
      if (errorFormat === "json") {
        const missingSubcommand = error.code === "commander.help";
        const message = missingSubcommand
          ? "Missing or unknown subcommand."
          : error.message.replace(/^error:\s*/u, "").trim();
        writeJsonError(io.stderr, {
          code: "GROOVECTL_USAGE",
          kind: "usage",
          message,
          remediation: missingSubcommand
            ? "Run `groovectl schema --compact` or pass `--help` to see available commands."
            : null,
          httpStatus: null,
          exitCode: 2,
        });
      }
      return 2;
    }

    const appError = asAppError(error);
    const exitCode = exitCodeForError(appError);
    if (errorFormat === "json") {
      writeJsonError(io.stderr, {
        code: appError.code,
        kind: appError.kind,
        message: appError.message,
        remediation: appError.remediation ?? null,
        httpStatus: appError.httpStatus ?? null,
        exitCode,
      });
    } else {
      io.stderr.write(`${appError.code}: ${appError.message}\n`);
      if (appError.remediation !== undefined) {
        io.stderr.write(`${appError.remediation}\n`);
      }
    }
    return exitCode;
  }
}

function resolveErrorFormat(
  argv: readonly string[],
  env: NodeJS.ProcessEnv,
): ErrorFormat {
  let detected: ErrorFormat | undefined;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--") break;
    if (arg === "--error-format") {
      const next = argv[index + 1];
      if (next === "json" || next === "text") detected = next;
      index += 1;
    } else if (arg?.startsWith("--error-format=")) {
      const value = arg.slice("--error-format=".length);
      if (value === "json" || value === "text") detected = value;
    }
  }
  if (detected !== undefined) return detected;
  return env.GROOVECTL_ERROR_FORMAT === "json" ? "json" : "text";
}

function writeJsonError(
  stderr: CliIo["stderr"],
  payload: {
    code: string;
    kind: string;
    message: string;
    remediation: string | null;
    httpStatus: number | null;
    exitCode: number;
  },
): void {
  stderr.write(`${JSON.stringify({ error: payload })}\n`);
}
