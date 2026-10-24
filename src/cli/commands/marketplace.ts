import { Command, InvalidArgumentError, Option } from "commander";

import { MarketplaceService } from "../../app/marketplace-service.js";
import { AppError } from "../../errors/app-error.js";
import {
  marketplaceCurrencies,
  type MarketplaceCurrency,
} from "../../domain/marketplace.js";
import { renderRecord, type Column } from "../../output/records.js";
import { positiveInteger } from "../create-program.js";
import { fieldsFor, tokenRequestFor } from "../global-options.js";
import type { CliIo } from "../run-cli.js";
import type { CliRuntime } from "../runtime.js";
import {
  addOutputOptions,
  outputFormat,
  type RecordOptions,
} from "./database-common.js";

interface MarketplaceOptions extends RecordOptions {
  currency?: MarketplaceCurrency;
}

export function createMarketplaceCommand(
  io: CliIo,
  runtime: CliRuntime,
): Command {
  const marketplace = new Command("marketplace")
    .description("Read current Discogs Marketplace data.")
    .addHelpText(
      "after",
      "\nData provided by Discogs. One-shot reads; no monitoring or stored market data.",
    );

  addOptions(
    marketplace
      .command("stats")
      .description(
        "Get a release's current lowest item price, sale count and blocked status (excludes shipping/tax).",
      )
      .argument("<release-id>", "Discogs release ID", positiveInteger),
  ).action(
    async (id: number, options: MarketplaceOptions, command: Command) => {
      await read(command, options, (service) =>
        service.getStats(id, options.currency),
      );
    },
  );

  const listing = marketplace
    .command("listing")
    .description("Read a known Marketplace listing.");
  addOptions(
    listing
      .command("get")
      .description(
        "Get public details by listing ID. Does not search listings by release.",
      )
      .argument("<listing-id>", "Discogs listing ID", positiveInteger),
  ).action(
    async (id: number, options: MarketplaceOptions, command: Command) => {
      await read(command, options, (service) =>
        service.getListing(id, options.currency),
      );
    },
  );

  addOptions(
    marketplace
      .command("fee")
      .description(
        "Ask Discogs for the selling fee for an item price (default currency: USD).",
      )
      .argument("<price>", "Non-negative decimal item price", decimalPrice),
  ).action(
    async (price: string, options: MarketplaceOptions, command: Command) => {
      await read(command, options, (service) =>
        service.getFee(price, options.currency),
      );
    },
  );

  async function read<T extends object>(
    command: Command,
    options: MarketplaceOptions,
    request: (service: MarketplaceService) => Promise<T>,
  ): Promise<void> {
    outputFormat(options);
    const format = await runtime.formatFor(
      command,
      options.format,
      options.json,
    );
    const resolved = await runtime.tokens.resolve(
      tokenRequestFor(command, "token_optional"),
    );
    const client = await runtime.clientFor(command, resolved?.token);
    let value: T;
    try {
      value = await request(new MarketplaceService(client));
    } catch (error: unknown) {
      if (
        resolved === undefined &&
        error instanceof AppError &&
        error.httpStatus === 401
      ) {
        throw new AppError({
          kind: "auth_required",
          code: "GROOVECTL_AUTH_REQUIRED",
          message:
            "Discogs requires a User Token for this Marketplace request.",
          remediation:
            "Use --token to enter one securely, --token-stdin, DISCOGS_TOKEN, or auth login, then retry.",
          httpStatus: 401,
        });
      }
      throw error;
    }
    const columns: Column<T>[] = (
      Object.keys(value) as Array<keyof T & string>
    ).map((key) => ({ key, value: (item: T) => item[key] }));
    renderRecord(value, format, columns, io.stdout, fieldsFor(command));
  }

  return marketplace;
}

function addOptions(command: Command): Command {
  return addOutputOptions(command).addOption(
    new Option(
      "--currency <code>",
      "Currency for the response; omit to use the API default.",
    ).choices([...marketplaceCurrencies]),
  );
}

// Preserve the decimal spelling in the URL; reject exponent and path syntax.
function decimalPrice(value: string): string {
  const number = Number(value);
  if (
    !/^\d+(?:\.\d+)?$/u.test(value) ||
    !Number.isFinite(number) ||
    number > Number.MAX_SAFE_INTEGER ||
    (number === 0 && /[1-9]/u.test(value))
  ) {
    throw new InvalidArgumentError(
      "expected a non-negative finite decimal price within the safe numeric range",
    );
  }
  return value;
}
