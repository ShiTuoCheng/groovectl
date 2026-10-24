import type { CliRuntime } from "./runtime.js";
import { AppError } from "../errors/app-error.js";

export async function confirmDestructiveAction(
  runtime: CliRuntime,
  yes: boolean,
  message: string,
): Promise<void> {
  if (yes) return;
  if (!runtime.interactive) {
    throw new AppError({
      kind: "cancelled",
      code: "GROOVECTL_CONFIRMATION_REQUIRED",
      message: "This destructive operation requires confirmation.",
      remediation:
        "Run interactively or pass --yes after reviewing the target.",
    });
  }
  if (!(await runtime.confirm(message))) {
    throw new AppError({
      kind: "cancelled",
      code: "GROOVECTL_CANCELLED",
      message: "Operation cancelled.",
    });
  }
}
