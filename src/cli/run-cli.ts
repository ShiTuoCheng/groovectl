import { CommanderError } from "commander";

import { createProgram } from "./create-program.js";
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
): Promise<number> {
  const program = createProgram(io);
  program.exitOverride();

  try {
    await program.parseAsync([...argv], { from: "user" });
    return 0;
  } catch (error: unknown) {
    if (error instanceof CommanderError) {
      return error.exitCode === 0 ? 0 : 2;
    }

    const appError = asAppError(error);
    io.stderr.write(`${appError.code}: ${appError.message}\n`);
    if (appError.remediation !== undefined) {
      io.stderr.write(`${appError.remediation}\n`);
    }
    return exitCodeForError(appError);
  }
}
