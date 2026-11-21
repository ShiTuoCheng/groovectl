import { Command, InvalidArgumentError, Option } from "commander";

import {
  MarketplaceService,
  type MarketplaceListingUpdatePatch,
} from "../../app/marketplace-service.js";
import type { OfferOptions } from "../../app/marketplace-offers.js";
import type {
  MarketplaceInventoryParameters,
  MarketplaceListingWritePayload,
  MarketplaceOrderMessagePayload,
  MarketplaceOrderUpdatePayload,
  MarketplaceOrdersParameters,
} from "../../discogs/client.js";
import { AppError } from "../../errors/app-error.js";
import {
  marketplaceCurrencies,
  marketplaceInventorySorts,
  marketplaceListingStatuses,
  marketplaceOfferSorts,
  marketplaceOrderSorts,
  mediaGrades,
  normalizeMediaCondition,
  normalizeSleeveCondition,
  type MarketplaceCurrency,
  type MarketplaceFee,
  type MarketplaceInventoryItem,
  type MarketplaceInventorySort,
  type MarketplaceListing,
  type MarketplaceListingMutationResult,
  type MarketplaceListingStatus,
  type MarketplaceOffer,
  type MarketplaceOfferSort,
  type MarketplaceOrder,
  type MarketplaceOrderMessage,
  type MarketplaceOrderSort,
  type MarketplacePriceSuggestion,
  type MarketplaceStats,
} from "../../domain/marketplace.js";
import {
  renderRecord,
  renderRecords,
  validateOutputFields,
  type Column,
} from "../../output/records.js";
import { confirmDestructiveAction } from "../confirmation.js";
import { nonNegativeInteger, positiveInteger } from "../create-program.js";
import { fieldsFor, isQuiet, tokenRequestFor } from "../global-options.js";
import type { CliIo } from "../run-cli.js";
import type { CliRuntime } from "../runtime.js";
import {
  addListOptions,
  addOutputOptions,
  asAsync,
  outputFormat,
  validateListOptions,
  type ListOptions,
  type RecordOptions,
} from "./database-common.js";

interface MarketplaceOptions extends RecordOptions {
  currency?: MarketplaceCurrency;
}

type MarketplaceListOptions = ListOptions & OfferOptions;

interface ListingCreateOptions extends RecordOptions {
  condition: string;
  sleeveCondition?: string;
  price: string;
  status: "For Sale" | "Draft";
  comments?: string;
  allowOffers?: boolean;
  externalId?: string;
  location?: string;
  weight?: number;
  formatQuantity?: number;
  dryRun?: boolean;
}

interface ListingUpdateOptions extends RecordOptions {
  condition?: string;
  sleeveCondition?: string;
  price?: string;
  status?: "For Sale" | "Draft";
  comments?: string;
  allowOffers?: boolean;
  externalId?: string;
  location?: string;
  weight?: number;
  formatQuantity?: number;
  dryRun?: boolean;
}

const statsColumns = columnsFor<MarketplaceStats>([
  "releaseId",
  "lowestPrice",
  "numForSale",
  "blockedFromSale",
  "resourceUrl",
  "marketplaceUrl",
]);

const priceSuggestionColumns = columnsFor<MarketplacePriceSuggestion>([
  "releaseId",
  "grade",
  "condition",
  "price",
]);

const listingColumns = columnsFor<MarketplaceListing>([
  "id",
  "status",
  "price",
  "originalPrice",
  "shippingPrice",
  "condition",
  "sleeveCondition",
  "comments",
  "postedAt",
  "shipsFrom",
  "seller",
  "release",
  "resourceUrl",
  "marketplaceUrl",
]);

const inventoryColumns = columnsFor<MarketplaceInventoryItem>([
  "id",
  "status",
  "price",
  "originalPrice",
  "shippingPrice",
  "condition",
  "sleeveCondition",
  "allowOffers",
  "shipsFrom",
  "seller",
  "release",
  "comments",
  "postedAt",
  "marketplaceUrl",
  "resourceUrl",
]);

const listingMutationColumns = columnsFor<MarketplaceListingMutationResult>([
  "action",
  "listingId",
  "releaseId",
  "status",
  "condition",
  "sleeveCondition",
  "price",
  "allowOffers",
  "comments",
  "marketplaceUrl",
  "resourceUrl",
  "dryRun",
]);

const orderColumns = columnsFor<MarketplaceOrder>([
  "id",
  "status",
  "nextStatus",
  "created",
  "lastActivity",
  "archived",
  "buyer",
  "seller",
  "items",
  "shipping",
  "fee",
  "total",
  "shippingAddress",
  "additionalInstructions",
  "marketplaceUrl",
  "resourceUrl",
]);

const orderMessageColumns = columnsFor<MarketplaceOrderMessage>([
  "timestamp",
  "type",
  "from",
  "subject",
  "message",
]);

const feeColumns = columnsFor<MarketplaceFee>(["price", "fee"]);

const offerColumns = columnsFor<MarketplaceOffer>([
  "id",
  "releaseId",
  "price",
  "condition",
  "sleeveCondition",
  "shipsFrom",
  "seller",
  "comments",
  "shippingText",
  "availability",
  "marketplaceUrl",
  "source",
  "sourceUrl",
  "readAt",
]);

export function createMarketplaceCommand(
  io: CliIo,
  runtime: CliRuntime,
): Command {
  const marketplace = new Command("marketplace")
    .description(
      "Read Discogs Marketplace prices, offers, inventory, listings, and orders.",
    )
    .addHelpText(
      "after",
      "\nData provided by Discogs. One-shot commands; no monitoring or stored market data.",
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
      await read(command, options, statsColumns, (service) =>
        service.getStats(id, options.currency),
      );
    },
  );

  addOutputOptions(
    marketplace
      .command("price-suggestions")
      .description(
        "Get Discogs suggested market prices by media condition for a release (requires a User Token with seller settings).",
      )
      .argument("<release-id>", "Discogs release ID", positiveInteger),
  ).action(async (id: number, options: RecordOptions, command: Command) => {
    const requestedFormat = outputFormat(options, command);
    const fields = fieldsFor(command);
    validateOutputFields(priceSuggestionColumns, fields);
    const format = await runtime.formatFor(
      command,
      requestedFormat,
      options.json,
    );
    const resolved = await runtime.tokens.resolve(
      tokenRequestFor(command, "token_required"),
    );
    const client = await runtime.clientFor(command, resolved?.token);
    const suggestions = await new MarketplaceService(
      client,
    ).getPriceSuggestions(id);
    await renderRecords(
      asAsync(suggestions),
      format,
      priceSuggestionColumns,
      io.stdout,
      fields,
    );
  });

  const listing = marketplace
    .command("listing")
    .description("Read or manage individual Marketplace listings.");

  addOptions(
    listing
      .command("get")
      .description(
        "Get public details by listing ID. Does not search listings by release.",
      )
      .argument("<listing-id>", "Discogs listing ID", positiveInteger),
  ).action(
    async (id: number, options: MarketplaceOptions, command: Command) => {
      await read(command, options, listingColumns, (service) =>
        service.getListing(id, options.currency),
      );
    },
  );

  addOutputOptions(
    listing
      .command("create")
      .description(
        "Create a new Marketplace listing for a release (defaults to Draft status for safety).",
      )
      .argument("<release-id>", "Discogs release ID", positiveInteger),
  )
    .requiredOption(
      "--condition <grade>",
      "Media condition (M, NM, VG+, VG, G+, G, F, P or full Discogs name).",
      mediaConditionArg,
    )
    .requiredOption(
      "--price <amount>",
      "Non-negative decimal listing price in your seller currency.",
      decimalPrice,
    )
    .addOption(
      new Option("--status <status>", "Initial listing status")
        .choices(["Draft", "For Sale"])
        .default("Draft"),
    )
    .option(
      "--sleeve-condition <grade>",
      "Sleeve condition (M..P, Generic, Not Graded, No Cover, or full Discogs name).",
      sleeveConditionArg,
    )
    .option("--comments <text>", "Public seller comments for buyers")
    .option("--allow-offers", "Allow buyers to make offers on this listing")
    .option("--external-id <id>", "Seller external SKU or inventory reference")
    .option("--location <text>", "Seller shelf or storage location")
    .option("--weight <grams>", "Weight in grams", nonNegativeInteger)
    .option(
      "--format-quantity <count>",
      "Item count for shipping calculation",
      positiveInteger,
    )
    .option("--dry-run", "Show the intended listing without writing.")
    .action(
      async (
        releaseId: number,
        options: ListingCreateOptions,
        command: Command,
      ) => {
        const format = await runtime.formatFor(
          command,
          outputFormat(options, command),
          options.json,
        );
        const fields = fieldsFor(command);
        validateOutputFields(listingMutationColumns, fields);
        const payload: MarketplaceListingWritePayload = {
          release_id: releaseId,
          condition: options.condition,
          price: Number(options.price),
          status: options.status,
          ...(options.sleeveCondition === undefined
            ? {}
            : { sleeve_condition: options.sleeveCondition }),
          ...(options.comments === undefined
            ? {}
            : { comments: options.comments }),
          ...(options.allowOffers === undefined
            ? {}
            : { allow_offers: options.allowOffers }),
          ...(options.externalId === undefined
            ? {}
            : { external_id: options.externalId }),
          ...(options.location === undefined
            ? {}
            : { location: options.location }),
          ...(options.weight === undefined ? {} : { weight: options.weight }),
          ...(options.formatQuantity === undefined
            ? {}
            : { format_quantity: options.formatQuantity }),
        };
        const resolved = await runtime.tokens.resolve(
          tokenRequestFor(command, "token_required"),
        );
        const client = await runtime.clientFor(command, resolved?.token);
        if (options.dryRun === true) {
          renderRecord(
            {
              action: "marketplace.listing.create",
              releaseId,
              status: payload.status,
              condition: payload.condition,
              sleeveCondition: payload.sleeve_condition ?? null,
              price: payload.price,
              ...(payload.allow_offers === undefined
                ? {}
                : { allowOffers: payload.allow_offers }),
              ...(payload.comments === undefined
                ? {}
                : { comments: payload.comments }),
              dryRun: true,
            },
            format,
            listingMutationColumns,
            io.stdout,
            fields,
          );
          return;
        }
        const created = await new MarketplaceService(client).createListing(
          payload,
        );
        renderRecord(
          created,
          format,
          listingMutationColumns,
          io.stdout,
          fields,
        );
      },
    );

  addOutputOptions(
    listing
      .command("update")
      .description(
        "Update an existing Marketplace listing (merges with current listing fields).",
      )
      .argument("<listing-id>", "Discogs listing ID", positiveInteger),
  )
    .option(
      "--condition <grade>",
      "Media condition (M..P or full Discogs name).",
      mediaConditionArg,
    )
    .option(
      "--sleeve-condition <grade>",
      "Sleeve condition (M..P, Generic, Not Graded, No Cover, or full Discogs name).",
      sleeveConditionArg,
    )
    .option("--price <amount>", "Updated listing price", decimalPrice)
    .addOption(
      new Option("--status <status>", "Listing status").choices([
        "Draft",
        "For Sale",
      ]),
    )
    .option("--comments <text>", "Updated seller comments")
    .option("--allow-offers", "Allow buyer offers")
    .option("--no-allow-offers", "Disallow buyer offers")
    .option("--external-id <id>", "Seller external SKU or inventory reference")
    .option("--location <text>", "Seller storage location")
    .option("--weight <grams>", "Weight in grams", nonNegativeInteger)
    .option(
      "--format-quantity <count>",
      "Item count for shipping calculation",
      positiveInteger,
    )
    .option("--dry-run", "Show the merged listing update without writing.")
    .action(
      async (
        listingId: number,
        options: ListingUpdateOptions,
        command: Command,
      ) => {
        const allowOffersSource = command.getOptionValueSource("allowOffers");
        const allowOffers =
          allowOffersSource === "cli" ? options.allowOffers : undefined;
        const patch: MarketplaceListingUpdatePatch = {
          ...(options.condition === undefined
            ? {}
            : { condition: options.condition }),
          ...(options.sleeveCondition === undefined
            ? {}
            : { sleeveCondition: options.sleeveCondition }),
          ...(options.price === undefined
            ? {}
            : { price: Number(options.price) }),
          ...(options.status === undefined ? {} : { status: options.status }),
          ...(options.comments === undefined
            ? {}
            : { comments: options.comments }),
          ...(allowOffers === undefined ? {} : { allowOffers }),
          ...(options.externalId === undefined
            ? {}
            : { externalId: options.externalId }),
          ...(options.location === undefined
            ? {}
            : { location: options.location }),
          ...(options.weight === undefined ? {} : { weight: options.weight }),
          ...(options.formatQuantity === undefined
            ? {}
            : { formatQuantity: options.formatQuantity }),
        };
        if (Object.keys(patch).length === 0) {
          throw new AppError({
            kind: "usage",
            code: "GROOVECTL_USAGE",
            message:
              "Provide at least one field to update (for example --price, --status, --condition, or --comments).",
          });
        }
        const format = await runtime.formatFor(
          command,
          outputFormat(options, command),
          options.json,
        );
        const fields = fieldsFor(command);
        validateOutputFields(listingMutationColumns, fields);
        const resolved = await runtime.tokens.resolve(
          tokenRequestFor(command, "token_required"),
        );
        const client = await runtime.clientFor(command, resolved?.token);
        const service = new MarketplaceService(client);
        const merged = await service.prepareListingUpdate(listingId, patch);
        if (options.dryRun !== true) {
          await service.updateListing(listingId, merged);
        }
        renderRecord(
          {
            action: "marketplace.listing.update",
            listingId,
            releaseId: merged.release_id,
            status: merged.status,
            condition: merged.condition,
            sleeveCondition: merged.sleeve_condition ?? null,
            price: merged.price,
            ...(merged.allow_offers === undefined
              ? {}
              : { allowOffers: merged.allow_offers }),
            ...(merged.comments === undefined
              ? {}
              : { comments: merged.comments }),
            marketplaceUrl: `https://www.discogs.com/sell/item/${String(listingId)}`,
            resourceUrl: `https://api.discogs.com/marketplace/listings/${String(listingId)}`,
            dryRun: options.dryRun === true,
          },
          format,
          listingMutationColumns,
          io.stdout,
          fields,
        );
      },
    );

  addOutputOptions(
    listing
      .command("delete")
      .description("Delete a Marketplace listing.")
      .argument("<listing-id>", "Discogs listing ID", positiveInteger),
  )
    .option("--yes", "Skip the confirmation prompt.")
    .option("--dry-run", "Show the intended deletion without writing.")
    .action(
      async (
        listingId: number,
        options: RecordOptions & { yes?: boolean; dryRun?: boolean },
        command: Command,
      ) => {
        const format = await runtime.formatFor(
          command,
          outputFormat(options, command),
          options.json,
        );
        const fields = fieldsFor(command);
        validateOutputFields(listingMutationColumns, fields);
        const resolved = await runtime.tokens.resolve(
          tokenRequestFor(command, "token_required"),
        );
        const client = await runtime.clientFor(command, resolved?.token);
        if (options.dryRun !== true) {
          await confirmDestructiveAction(
            runtime,
            options.yes === true,
            `Delete Marketplace listing ${String(listingId)}?`,
          );
          await new MarketplaceService(client).deleteListing(listingId);
        }
        renderRecord(
          {
            action: "marketplace.listing.delete",
            listingId,
            marketplaceUrl: `https://www.discogs.com/sell/item/${String(listingId)}`,
            resourceUrl: `https://api.discogs.com/marketplace/listings/${String(listingId)}`,
            dryRun: options.dryRun === true,
          },
          format,
          listingMutationColumns,
          io.stdout,
          fields,
        );
      },
    );

  addListOptions(
    marketplace
      .command("listings")
      .description(
        "Read a release's website offers (best-effort HTML, not the official API).",
      )
      .argument("<release-id>", "Discogs release ID", positiveInteger),
  )
    .option(
      "--html <file>",
      "Read a saved English release Marketplace page instead of the network.",
    )
    .addOption(
      new Option("--sort <order>", "Offer sort order for live reads")
        .choices([...marketplaceOfferSorts])
        .default("price-asc"),
    )
    .option(
      "--ships-from <country>",
      "Seller country, e.g. United Kingdom (not the release country).",
      nonEmpty,
    )
    .addOption(
      new Option(
        "--currency <code>",
        "Keep prices in this original currency; no conversion.",
      ).choices([...marketplaceCurrencies]),
    )
    .addOption(
      new Option("--min-media <grade>", "Minimum media grade.").choices([
        ...mediaGrades,
      ]),
    )
    .addOption(
      new Option(
        "--min-sleeve <grade>",
        "Minimum sleeve grade; unknown/generic sleeves do not match.",
      ).choices([...mediaGrades]),
    )
    .option(
      "--max-price <amount>",
      "Maximum item price; requires --currency, excludes shipping and tax.",
      decimalPrice,
    )
    .option(
      "--min-seller-rating <percent>",
      "Minimum seller positive feedback percentage (0–100).",
      percentage,
    )
    .option(
      "--include-unavailable",
      "Include offers the page marks unavailable to its destination.",
    )
    .action(
      async (
        id: number,
        options: MarketplaceListOptions & { sort?: MarketplaceOfferSort },
        command: Command,
      ) => {
        validateListOptions(options, command);
        if (
          options.html !== undefined &&
          (options.all === true ||
            options.page !== undefined ||
            command.getOptionValueSource("sort") === "cli")
        ) {
          throw new AppError({
            kind: "usage",
            code: "GROOVECTL_HTML_PAGINATION_CONFLICT",
            message:
              "--html reads one saved page; do not combine it with --all, --page, or --sort.",
          });
        }
        if (options.maxPrice !== undefined && options.currency === undefined) {
          throw new AppError({
            kind: "usage",
            code: "GROOVECTL_CURRENCY_REQUIRED",
            message:
              "--max-price requires --currency to avoid comparing different currencies.",
          });
        }
        const fields = fieldsFor(command);
        validateOutputFields(offerColumns, fields);
        const format = await runtime.formatFor(
          command,
          options.format,
          options.json,
        );
        const service = await runtime.marketplaceOffersFor(command);
        if (!isQuiet(command) && runtime.errorFormat !== "json") {
          io.stderr.write(
            options.html !== undefined
              ? "Source: saved HTML (freshness and destination unknown); only that page is read. Filters apply locally.\n"
              : `Source: Discogs website, not API-verified. ${options.all === true ? "Reading pages serially." : "Reading one page; use --all for all pages."} Filters apply to the pages read. Shipping/tax are not included.\n`,
          );
        }
        await renderRecords(
          service.list(id, options),
          format,
          offerColumns,
          io.stdout,
          fields,
          options.limit,
        );
      },
    );

  addListOptions(
    marketplace
      .command("inventory")
      .description(
        "List a seller's Marketplace inventory (defaults to the authenticated user when username is omitted).",
      )
      .argument("[username]", "Seller username", nonEmpty),
  )
    .addOption(
      new Option("--status <status>", "Filter by listing status").choices([
        ...marketplaceListingStatuses,
      ]),
    )
    .addOption(
      new Option("--sort <field>", "Sort inventory by field").choices([
        ...marketplaceInventorySorts,
      ]),
    )
    .addOption(
      new Option("--sort-order <order>", "Sort order").choices(["asc", "desc"]),
    )
    .action(
      async (
        username: string | undefined,
        options: ListOptions & {
          status?: MarketplaceListingStatus;
          sort?: MarketplaceInventorySort;
          sortOrder?: "asc" | "desc";
        },
        command: Command,
      ) => {
        validateListOptions(options, command);
        const fields = fieldsFor(command);
        validateOutputFields(inventoryColumns, fields);
        const format = await runtime.formatFor(
          command,
          outputFormat(options, command),
          options.json,
        );
        const policy =
          username === undefined ? "token_required" : "token_optional";
        const resolved = await runtime.tokens.resolve(
          tokenRequestFor(command, policy),
        );
        const client = await runtime.clientFor(command, resolved?.token);
        const targetUsername =
          username ?? (await client.getIdentity()).username;
        const service = new MarketplaceService(client);
        const shared: Omit<MarketplaceInventoryParameters, "page"> = {
          per_page: options.perPage,
          ...(options.status === undefined ? {} : { status: options.status }),
          ...(options.sort === undefined ? {} : { sort: options.sort }),
          ...(options.sortOrder === undefined
            ? {}
            : { sort_order: options.sortOrder }),
        };
        try {
          const values =
            options.all === true
              ? service.getInventoryAll(targetUsername, shared)
              : asAsync(
                  await service.getInventory(targetUsername, {
                    ...shared,
                    ...(options.page === undefined
                      ? {}
                      : { page: options.page }),
                  }),
                );
          await renderRecords(
            values,
            format,
            inventoryColumns,
            io.stdout,
            fields,
            options.limit,
          );
        } catch (error: unknown) {
          rethrowAnonymousAuthError(resolved, error);
        }
      },
    );

  const orders = marketplace
    .command("orders")
    .description("Read and manage authenticated seller Marketplace orders.");

  addListOptions(orders.command("list").description("List Marketplace orders."))
    .option("--status <status>", "Filter orders by status")
    .option(
      "--created-after <iso>",
      "Filter orders created after ISO timestamp",
    )
    .option(
      "--created-before <iso>",
      "Filter orders created before ISO timestamp",
    )
    .option("--archived", "Include archived orders")
    .addOption(
      new Option("--sort <field>", "Sort orders by field").choices([
        ...marketplaceOrderSorts,
      ]),
    )
    .addOption(
      new Option("--sort-order <order>", "Sort order").choices(["asc", "desc"]),
    )
    .action(
      async (
        options: ListOptions & {
          status?: string;
          createdAfter?: string;
          createdBefore?: string;
          archived?: boolean;
          sort?: MarketplaceOrderSort;
          sortOrder?: "asc" | "desc";
        },
        command: Command,
      ) => {
        validateListOptions(options, command);
        const fields = fieldsFor(command);
        validateOutputFields(orderColumns, fields);
        const format = await runtime.formatFor(
          command,
          outputFormat(options, command),
          options.json,
        );
        const resolved = await runtime.tokens.resolve(
          tokenRequestFor(command, "token_required"),
        );
        const client = await runtime.clientFor(command, resolved?.token);
        const service = new MarketplaceService(client);
        const shared: Omit<MarketplaceOrdersParameters, "page"> = {
          per_page: options.perPage,
          ...(options.status === undefined ? {} : { status: options.status }),
          ...(options.createdAfter === undefined
            ? {}
            : { created_after: options.createdAfter }),
          ...(options.createdBefore === undefined
            ? {}
            : { created_before: options.createdBefore }),
          ...(options.archived === true ? { archived: true } : {}),
          ...(options.sort === undefined ? {} : { sort: options.sort }),
          ...(options.sortOrder === undefined
            ? {}
            : { sort_order: options.sortOrder }),
        };
        const values =
          options.all === true
            ? service.getOrdersAll(shared)
            : asAsync(
                await service.getOrders({
                  ...shared,
                  ...(options.page === undefined ? {} : { page: options.page }),
                }),
              );
        await renderRecords(
          values,
          format,
          orderColumns,
          io.stdout,
          fields,
          options.limit,
        );
      },
    );

  addOutputOptions(
    orders
      .command("get")
      .description("Get details for one Marketplace order.")
      .argument(
        "<order-id>",
        "Discogs order ID (for example: 12345-1)",
        nonEmpty,
      ),
  ).action(
    async (orderId: string, options: RecordOptions, command: Command) => {
      const requestedFormat = outputFormat(options, command);
      const fields = fieldsFor(command);
      validateOutputFields(orderColumns, fields);
      const format = await runtime.formatFor(
        command,
        requestedFormat,
        options.json,
      );
      const resolved = await runtime.tokens.resolve(
        tokenRequestFor(command, "token_required"),
      );
      const client = await runtime.clientFor(command, resolved?.token);
      const order = await new MarketplaceService(client).getOrder(orderId);
      renderRecord(order, format, orderColumns, io.stdout, fields);
    },
  );

  addOutputOptions(
    orders
      .command("update")
      .description(
        "Update a Marketplace order's status and/or shipping amount.",
      )
      .argument("<order-id>", "Discogs order ID", nonEmpty),
  )
    .option("--status <status>", "New order status", nonEmpty)
    .option("--shipping <amount>", "New shipping amount", decimalPrice)
    .option("--dry-run", "Show the intended update without writing.")
    .action(
      async (
        orderId: string,
        options: RecordOptions & {
          status?: string;
          shipping?: string;
          dryRun?: boolean;
        },
        command: Command,
      ) => {
        if (options.status === undefined && options.shipping === undefined) {
          throw new AppError({
            kind: "usage",
            code: "GROOVECTL_USAGE",
            message: "Provide --status and/or --shipping.",
          });
        }
        const dryRunColumns = columnsFor<{
          action: string;
          orderId: string;
          status?: string;
          shipping?: number;
          dryRun: boolean;
        }>(["action", "orderId", "status", "shipping", "dryRun"]);
        const requestedFormat = outputFormat(options, command);
        const fields = fieldsFor(command);
        const dryRun = options.dryRun === true;
        validateOutputFields(dryRun ? dryRunColumns : orderColumns, fields);
        const format = await runtime.formatFor(
          command,
          requestedFormat,
          options.json,
        );
        const payload: MarketplaceOrderUpdatePayload = {
          ...(options.status === undefined ? {} : { status: options.status }),
          ...(options.shipping === undefined
            ? {}
            : { shipping: Number(options.shipping) }),
        };
        const resolved = await runtime.tokens.resolve(
          tokenRequestFor(command, "token_required"),
        );
        const client = await runtime.clientFor(command, resolved?.token);
        if (dryRun) {
          renderRecord(
            {
              action: "marketplace.orders.update",
              orderId,
              ...(payload.status === undefined
                ? {}
                : { status: payload.status }),
              ...(payload.shipping === undefined
                ? {}
                : { shipping: payload.shipping }),
              dryRun: true,
            },
            format,
            dryRunColumns,
            io.stdout,
            fields,
          );
          return;
        }
        const updated = await new MarketplaceService(client).updateOrder(
          orderId,
          payload,
        );
        renderRecord(updated, format, orderColumns, io.stdout, fields);
      },
    );

  addListOptions(
    orders
      .command("messages")
      .description("List messages on a Marketplace order.")
      .argument("<order-id>", "Discogs order ID", nonEmpty),
  ).action(async (orderId: string, options: ListOptions, command: Command) => {
    validateListOptions(options, command);
    const fields = fieldsFor(command);
    validateOutputFields(orderMessageColumns, fields);
    const format = await runtime.formatFor(
      command,
      outputFormat(options, command),
      options.json,
    );
    const resolved = await runtime.tokens.resolve(
      tokenRequestFor(command, "token_required"),
    );
    const client = await runtime.clientFor(command, resolved?.token);
    const service = new MarketplaceService(client);
    const values =
      options.all === true
        ? service.getOrderMessagesAll(orderId, { per_page: options.perPage })
        : asAsync(
            await service.getOrderMessages(orderId, {
              per_page: options.perPage,
              ...(options.page === undefined ? {} : { page: options.page }),
            }),
          );
    await renderRecords(
      values,
      format,
      orderMessageColumns,
      io.stdout,
      fields,
      options.limit,
    );
  });

  addOutputOptions(
    orders
      .command("message")
      .description(
        "Post a message (and optionally update status) on a Marketplace order.",
      )
      .argument("<order-id>", "Discogs order ID", nonEmpty),
  )
    .option("--message <text>", "Message text to post", nonEmpty)
    .option("--status <status>", "Optional new order status", nonEmpty)
    .option("--dry-run", "Show the intended message without writing.")
    .action(
      async (
        orderId: string,
        options: RecordOptions & {
          message?: string;
          status?: string;
          dryRun?: boolean;
        },
        command: Command,
      ) => {
        if (options.message === undefined && options.status === undefined) {
          throw new AppError({
            kind: "usage",
            code: "GROOVECTL_USAGE",
            message: "Provide --message and/or --status.",
          });
        }
        const dryRunColumns = columnsFor<{
          action: string;
          orderId: string;
          message?: string;
          status?: string;
          dryRun: boolean;
        }>(["action", "orderId", "message", "status", "dryRun"]);
        const requestedFormat = outputFormat(options, command);
        const fields = fieldsFor(command);
        const dryRun = options.dryRun === true;
        validateOutputFields(
          dryRun ? dryRunColumns : orderMessageColumns,
          fields,
        );
        const format = await runtime.formatFor(
          command,
          requestedFormat,
          options.json,
        );
        const payload: MarketplaceOrderMessagePayload = {
          ...(options.message === undefined
            ? {}
            : { message: options.message }),
          ...(options.status === undefined ? {} : { status: options.status }),
        };
        const resolved = await runtime.tokens.resolve(
          tokenRequestFor(command, "token_required"),
        );
        const client = await runtime.clientFor(command, resolved?.token);
        if (dryRun) {
          renderRecord(
            {
              action: "marketplace.orders.message",
              orderId,
              ...(payload.message === undefined
                ? {}
                : { message: payload.message }),
              ...(payload.status === undefined
                ? {}
                : { status: payload.status }),
              dryRun: true,
            },
            format,
            dryRunColumns,
            io.stdout,
            fields,
          );
          return;
        }
        const posted = await new MarketplaceService(client).addOrderMessage(
          orderId,
          payload,
        );
        renderRecord(posted, format, orderMessageColumns, io.stdout, fields);
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
      await read(command, options, feeColumns, (service) =>
        service.getFee(price, options.currency),
      );
    },
  );

  async function read<T extends object>(
    command: Command,
    options: MarketplaceOptions,
    columns: readonly Column<T>[],
    request: (service: MarketplaceService) => Promise<T>,
  ): Promise<void> {
    outputFormat(options, command);
    const fields = fieldsFor(command);
    validateOutputFields(columns, fields);
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
      rethrowAnonymousAuthError(resolved, error);
    }
    renderRecord(value, format, columns, io.stdout, fields);
  }

  return marketplace;
}

function rethrowAnonymousAuthError(resolved: unknown, error: unknown): never {
  if (
    resolved === undefined &&
    error instanceof AppError &&
    error.httpStatus === 401
  ) {
    throw new AppError({
      kind: "auth_required",
      code: "GROOVECTL_AUTH_REQUIRED",
      message: "Discogs requires a User Token for this Marketplace request.",
      remediation:
        "Use --token to enter one securely, --token-stdin, DISCOGS_TOKEN, or auth login, then retry.",
      httpStatus: 401,
    });
  }
  throw error;
}

function columnsFor<T extends object>(
  keys: readonly (keyof T & string)[],
): Column<T>[] {
  return keys.map((key) => ({ key, value: (item: T) => item[key] }));
}

function nonEmpty(value: string): string {
  if (!value.trim()) {
    throw new InvalidArgumentError("expected a non-empty value");
  }
  return value.trim();
}

function mediaConditionArg(value: string): string {
  const normalized = normalizeMediaCondition(value);
  if (normalized === undefined) {
    throw new InvalidArgumentError(
      `expected a Discogs media grade (${mediaGrades.join(", ")}) or full condition name`,
    );
  }
  return normalized;
}

function sleeveConditionArg(value: string): string {
  const normalized = normalizeSleeveCondition(value);
  if (normalized === undefined) {
    throw new InvalidArgumentError(
      `expected a Discogs sleeve grade (${mediaGrades.join(", ")}, Generic, Not Graded, No Cover) or full condition name`,
    );
  }
  return normalized;
}

function percentage(value: string): number {
  if (!/^\d+(?:\.\d+)?$/u.test(value) || Number(value) > 100) {
    throw new InvalidArgumentError("expected a percentage between 0 and 100");
  }
  return Number(value);
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
