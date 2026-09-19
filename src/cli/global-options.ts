import type { Command } from "commander";

import type { AuthPolicy, TokenRequest } from "../auth/token-provider.js";

export interface GlobalOptions {
  color?: boolean;
  fields?: string;
  token?: boolean;
  tokenStdin?: boolean;
  timeout?: number;
  verbose?: boolean;
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
