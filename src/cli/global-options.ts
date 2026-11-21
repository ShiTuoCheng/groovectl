import type { Command } from "commander";

import type { AuthPolicy, TokenRequest } from "../auth/token-provider.js";

export type ErrorFormat = "text" | "json";

export interface GlobalOptions {
  color?: boolean;
  errorFormat?: ErrorFormat;
  fields?: string;
  quiet?: boolean;
  token?: boolean;
  tokenStdin?: boolean;
  timeout?: number;
  verbose?: boolean;
}

export function isQuiet(command: Command): boolean {
  return command.optsWithGlobals<GlobalOptions>().quiet === true;
}

export function tokenRequestFor(
  command: Command,
  policy: AuthPolicy,
  forcePrompt = false,
): TokenRequest {
  const options = command.optsWithGlobals<GlobalOptions>();
  return {
    policy,
    tokenStdin: options.tokenStdin === true,
    forcePrompt: forcePrompt || options.token === true,
  };
}

export function timeoutFor(command: Command): number | undefined {
  return command.optsWithGlobals<GlobalOptions>().timeout;
}

export function fieldsFor(command: Command): string[] | undefined {
  const value = command.optsWithGlobals<GlobalOptions>().fields;
  if (value === undefined) return undefined;
  const fields = value
    .split(",")
    .map((field) => field.trim())
    .filter(Boolean);
  return fields.length === 0 ? undefined : fields;
}
