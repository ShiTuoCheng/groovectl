import type { Command } from "commander";

import type { AuthPolicy, TokenRequest } from "../auth/token-provider.js";

interface GlobalOptions {
  token?: boolean;
  tokenStdin?: boolean;
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
