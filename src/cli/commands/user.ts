import { Command } from "commander";

import { UserService } from "../../app/user-service.js";
import type { UserProfile } from "../../domain/user-resource.js";
import { renderRecord, validateOutputFields } from "../../output/records.js";
import { nonEmptyText } from "../create-program.js";
import { fieldsFor, tokenRequestFor } from "../global-options.js";
import type { CliIo } from "../run-cli.js";
import type { CliRuntime } from "../runtime.js";
import {
  addOutputOptions,
  outputFormat,
  type RecordOptions,
} from "./database-common.js";

const profileColumns = [
  { key: "id", value: (item: UserProfile) => item.id },
  { key: "username", value: (item: UserProfile) => item.username },
  { key: "name", value: (item: UserProfile) => item.name },
  { key: "location", value: (item: UserProfile) => item.location },
  { key: "currency", value: (item: UserProfile) => item.currency },
  { key: "numCollection", value: (item: UserProfile) => item.numCollection },
  { key: "numWantlist", value: (item: UserProfile) => item.numWantlist },
  { key: "numForSale", value: (item: UserProfile) => item.numForSale },
  { key: "numLists", value: (item: UserProfile) => item.numLists },
  { key: "buyerRating", value: (item: UserProfile) => item.buyerRating },
  { key: "sellerRating", value: (item: UserProfile) => item.sellerRating },
  { key: "registered", value: (item: UserProfile) => item.registered },
  { key: "profile", value: (item: UserProfile) => item.profile },
  { key: "homePage", value: (item: UserProfile) => item.homePage },
  { key: "url", value: (item: UserProfile) => item.url },
] as const;

export function createUserCommand(io: CliIo, runtime: CliRuntime): Command {
  const user = new Command("user").description("Read Discogs user profiles.");

  addOutputOptions(
    user
      .command("profile")
      .description(
        "Get a Discogs user profile (defaults to the authenticated user when username is omitted).",
      )
      .argument("[username]", "Discogs username", nonEmptyText),
  ).action(
    async (
      username: string | undefined,
      options: RecordOptions,
      command: Command,
    ) => {
      const requestedFormat = outputFormat(options, command);
      const fields = fieldsFor(command);
      validateOutputFields(profileColumns, fields);
      const format = await runtime.formatFor(
        command,
        requestedFormat,
        options.json,
      );
      const policy =
        username === undefined ? "token_required" : "token_optional";
      const resolved = await runtime.tokens.resolve(
        tokenRequestFor(command, policy),
      );
      const client = await runtime.clientFor(command, resolved?.token);
      const targetUsername = username ?? (await client.getIdentity()).username;
      const result = await new UserService(client).getProfile(targetUsername);
      renderRecord(result, format, profileColumns, io.stdout, fields);
    },
  );

  return user;
}
