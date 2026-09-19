import { Command } from "commander";

import { tokenRequestFor } from "../global-options.js";
import type { CliRuntime } from "../runtime.js";
import type { CliIo } from "../run-cli.js";

export function createAuthCommand(io: CliIo, runtime: CliRuntime): Command {
  const auth = new Command("auth").description(
    "Manage Discogs authentication.",
  );

  auth
    .command("login")
    .description("Validate and save a Discogs User Token in the OS keyring.")
    .action(async (_options: unknown, command: Command) => {
      const resolved = await runtime.tokens.resolve(
        tokenRequestFor(command, "token_required", true),
      );
      if (resolved === undefined) return;
      const identity = await runtime.client(resolved.token).getIdentity();
      await runtime.keyring.set(resolved.token);
      io.stdout.write(`Authenticated as @${identity.username}.\n`);
    });

  auth
    .command("status")
    .description("Check the active Discogs identity without showing the token.")
    .option("--json", "Output a JSON document.")
    .action(async (options: { json?: boolean }, command: Command) => {
      const resolved = await runtime.tokens.resolve(
        tokenRequestFor(command, "token_optional"),
      );
      if (resolved === undefined) {
        io.stdout.write(
          options.json === true
            ? `${JSON.stringify({ authenticated: false })}\n`
            : "Not authenticated.\n",
        );
        return;
      }
      const identity = await runtime.client(resolved.token).getIdentity();
      const result = {
        authenticated: true,
        username: identity.username,
        source: resolved.source,
      };
      io.stdout.write(
        options.json === true
          ? `${JSON.stringify(result, null, 2)}\n`
          : `Authenticated as @${identity.username} (${resolved.source}).\n`,
      );
    });

  auth
    .command("logout")
    .description("Delete the locally saved token from the OS keyring.")
    .action(async () => {
      const deleted = await runtime.keyring.delete();
      io.stdout.write(
        deleted
          ? "Local credential deleted. The token is still active on Discogs.\n"
          : "No local credential was stored.\n",
      );
    });

  return auth;
}
