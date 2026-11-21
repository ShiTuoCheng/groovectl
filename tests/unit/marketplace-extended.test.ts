import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { runCli } from "../../src/cli/run-cli.js";
import type { RuntimeDependencies } from "../../src/cli/runtime.js";
import { listingFixture } from "../fixtures/marketplace.js";
import { marketplacePage } from "../fixtures/marketplace-page.js";

let directory: string;
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), "groovectl-mkt-ext-"));
});
afterEach(async () => {
  await rm(directory, { recursive: true, force: true });
});

interface RecordedCall {
  method: string;
  url: URL;
  body: unknown;
}

function makeRouter(handlers: Record<string, unknown>) {
  const calls: RecordedCall[] = [];
  const fetch = vi.fn<typeof globalThis.fetch>((input, init) => {
    const url =
      input instanceof URL
        ? input
        : new URL(input instanceof Request ? input.url : input);
    const method = (init?.method ?? "GET").toUpperCase();
    const rawBody = typeof init?.body === "string" ? init.body : undefined;
    calls.push({
      method,
      url,
      body:
        rawBody === undefined ? undefined : (JSON.parse(rawBody) as unknown),
    });
    const key = `${method} ${url.pathname}`;
    const response = key in handlers ? handlers[key] : handlers[url.pathname];
    if (response === undefined) {
      return Promise.resolve(new Response(null, { status: 404 }));
    }
    if (response === null) {
      return Promise.resolve(new Response(null, { status: 204 }));
    }
    return Promise.resolve(Response.json(response));
  });
  return { fetch, calls };
}

async function invoke(
  args: string[],
  handlers: Record<string, unknown> = {},
  extra: RuntimeDependencies = {},
  authenticated = true,
) {
  let stdout = "";
  let stderr = "";
  const { fetch, calls } = makeRouter({
    "GET /oauth/identity": {
      id: 8,
      username: "seller-me",
      resource_url: "https://api.discogs.com/users/seller-me",
    },
    ...handlers,
  });
  const code = await runCli(
    args,
    {
      stdout: {
        write: (text) => {
          stdout += String(text);
          return true;
        },
      },
      stderr: {
        write: (text) => {
          stderr += String(text);
          return true;
        },
      },
    },
    {
      env: {
        NODE_ENV: "test",
        GROOVECTL_CONFIG_DIR: directory,
        ...(authenticated ? { DISCOGS_TOKEN: "fake-token" } : {}),
      },
      interactive: false,
      fetch,
      ...extra,
    },
  );
  return { code, stdout, stderr, calls };
}

describe("Extended Marketplace CLI", () => {
  it("reads condition-by-condition price suggestions ordered from Mint down to Poor", async () => {
    const res = await invoke(
      ["marketplace", "price-suggestions", "249504", "--json"],
      {
        "GET /marketplace/price_suggestions/249504": {
          "Very Good (VG)": { value: 25, currency: "USD" },
          "Mint (M)": { value: 120, currency: "USD" },
          "Very Good Plus (VG+)": { value: 60, currency: "USD" },
          "Near Mint (NM or M-)": { value: 90, currency: "USD" },
        },
      },
    );
    expect(res.code).toBe(0);
    expect(JSON.parse(res.stdout)).toEqual([
      {
        releaseId: 249504,
        grade: "M",
        condition: "Mint (M)",
        price: { value: 120, currency: "USD" },
      },
      {
        releaseId: 249504,
        grade: "NM",
        condition: "Near Mint (NM or M-)",
        price: { value: 90, currency: "USD" },
      },
      {
        releaseId: 249504,
        grade: "VG+",
        condition: "Very Good Plus (VG+)",
        price: { value: 60, currency: "USD" },
      },
      {
        releaseId: 249504,
        grade: "VG",
        condition: "Very Good (VG)",
        price: { value: 25, currency: "USD" },
      },
    ]);

    const empty = await invoke(
      ["marketplace", "price-suggestions", "1", "--json"],
      { "GET /marketplace/price_suggestions/1": {} },
    );
    expect(empty.code).toBe(0);
    expect(JSON.parse(empty.stdout)).toEqual([]);

    const unauth = await invoke(
      ["marketplace", "price-suggestions", "249504", "--json"],
      {},
      {},
      false,
    );
    expect(unauth.code).toBe(3);
    expect(unauth.stderr).toContain("GROOVECTL_AUTH_REQUIRED");
  });

  it("supports --sort on website marketplace listings", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(() =>
      Promise.resolve(
        new Response(marketplacePage(), {
          headers: { "Content-Type": "text/html" },
        }),
      ),
    );
    const res = await invoke(
      [
        "--quiet",
        "marketplace",
        "listings",
        "7",
        "--sort",
        "listed-desc",
        "--json",
      ],
      {},
      { fetch },
      false,
    );
    expect(res.code).toBe(0);
    expect(fetch.mock.calls[0]?.[0]).toEqual(
      new URL(
        "https://www.discogs.com/sell/release/7?page=1&limit=50&sort=listed%2Cdesc&_pjax=%23pjax_container",
      ),
    );
  });

  it("reads public seller inventory and authenticated own inventory with filters", async () => {
    const inventoryResponse = {
      pagination: {
        page: 1,
        pages: 1,
        per_page: 50,
        items: 1,
        urls: { next: null },
      },
      listings: [
        {
          id: 901,
          status: "For Sale",
          price: { value: 35, currency: "USD" },
          condition: "Near Mint (NM or M-)",
          sleeve_condition: "Very Good Plus (VG+)",
          allow_offers: true,
          ships_from: "United States",
          release: {
            id: 249504,
            description: "Miles Davis - Kind of Blue",
            artist: "Miles Davis",
            title: "Kind of Blue",
            format: "LP, Album",
            catalog_number: "CL 1355",
            year: 1959,
          },
        },
      ],
    };

    const publicShop = await invoke(
      [
        "marketplace",
        "inventory",
        "record-shop",
        "--status",
        "For Sale",
        "--sort",
        "price",
        "--sort-order",
        "asc",
        "--json",
      ],
      { "GET /users/record-shop/inventory": inventoryResponse },
      {},
      false,
    );
    expect(publicShop.code).toBe(0);
    expect(publicShop.calls[0]?.url.pathname).toBe(
      "/users/record-shop/inventory",
    );
    expect(publicShop.calls[0]?.url.searchParams.get("status")).toBe(
      "For Sale",
    );
    expect(JSON.parse(publicShop.stdout)).toMatchObject([
      {
        id: 901,
        allowOffers: true,
        seller: { username: "record-shop" },
        release: { id: 249504, catalogNumber: "CL 1355" },
      },
    ]);

    const ownShop = await invoke(
      ["marketplace", "inventory", "--all", "--format", "tsv"],
      { "GET /users/seller-me/inventory": inventoryResponse },
    );
    expect(ownShop.code).toBe(0);
    expect(ownShop.calls[1]?.url.pathname).toBe("/users/seller-me/inventory");

    const emptySeller = await invoke(
      ["marketplace", "inventory", "  "],
      {},
      {},
      false,
    );
    expect(emptySeller.code).toBe(2);
    expect(emptySeller.calls).toHaveLength(0);

    const anonDenied = await invoke(
      ["marketplace", "inventory", "private-shop", "--json"],
      {},
      {
        fetch: () => Promise.resolve(new Response(null, { status: 401 })),
      },
      false,
    );
    expect(anonDenied.code).toBe(3);
    expect(anonDenied.stderr).toContain("GROOVECTL_AUTH_REQUIRED");
  });

  it("creates, merges-on-update, and deletes seller listings with safety guards", async () => {
    const handlers = {
      "POST /marketplace/listings": {
        listing_id: 555,
        resource_url: "https://api.discogs.com/marketplace/listings/555",
      },
      "GET /marketplace/listings/555": {
        ...listingFixture,
        id: 555,
        status: "For Sale",
        allow_offers: true,
        location: "Shelf B2",
        weight: 260,
        format_quantity: 1,
        external_id: "SKU-555",
      },
      "POST /marketplace/listings/555": null,
      "DELETE /marketplace/listings/555": null,
    };

    const badGrade = await invoke(
      [
        "marketplace",
        "listing",
        "create",
        "7",
        "--condition",
        "EX",
        "--price",
        "25.00",
      ],
      handlers,
    );
    expect(badGrade.code).toBe(2);
    expect(badGrade.calls).toHaveLength(0);

    const dryCreate = await invoke(
      [
        "marketplace",
        "listing",
        "create",
        "7",
        "--condition",
        "vg+",
        "--sleeve-condition",
        "m-",
        "--price",
        "25.00",
        "--allow-offers",
        "--dry-run",
        "--json",
      ],
      handlers,
    );
    expect(dryCreate.code).toBe(0);
    expect(dryCreate.calls).toHaveLength(0);
    expect(JSON.parse(dryCreate.stdout)).toMatchObject({
      action: "marketplace.listing.create",
      releaseId: 7,
      condition: "Very Good Plus (VG+)",
      sleeveCondition: "Near Mint (NM or M-)",
      status: "Draft",
      price: 25,
      allowOffers: true,
      dryRun: true,
    });

    const created = await invoke(
      [
        "marketplace",
        "listing",
        "create",
        "7",
        "--condition",
        "NM",
        "--price",
        "49.99",
        "--status",
        "For Sale",
        "--comments",
        "Clean copy",
        "--weight",
        "250",
        "--format-quantity",
        "1",
        "--json",
      ],
      handlers,
    );
    expect(created.code).toBe(0);
    expect(created.calls[0]).toMatchObject({
      method: "POST",
      body: {
        release_id: 7,
        condition: "Near Mint (NM or M-)",
        price: 49.99,
        status: "For Sale",
        comments: "Clean copy",
        weight: 250,
        format_quantity: 1,
      },
    });
    expect(JSON.parse(created.stdout)).toMatchObject({
      listingId: 555,
      marketplaceUrl: "https://www.discogs.com/sell/item/555",
      dryRun: false,
    });

    const emptyUpdate = await invoke(
      ["marketplace", "listing", "update", "555"],
      handlers,
    );
    expect(emptyUpdate.code).toBe(2);
    expect(emptyUpdate.calls).toHaveLength(0);

    const updated = await invoke(
      [
        "marketplace",
        "listing",
        "update",
        "555",
        "--price",
        "19.50",
        "--no-allow-offers",
        "--json",
      ],
      handlers,
    );
    expect(updated.code).toBe(0);
    expect(updated.calls).toHaveLength(2);
    expect(updated.calls[1]).toMatchObject({
      method: "POST",
      body: {
        release_id: 7,
        condition: "Very Good Plus (VG+)",
        sleeve_condition: "Generic",
        price: 19.5,
        status: "For Sale",
        allow_offers: false,
        location: "Shelf B2",
        weight: 260,
        format_quantity: 1,
        external_id: "SKU-555",
      },
    });

    const soldRefused = await invoke(
      ["marketplace", "listing", "update", "556", "--price", "19.50"],
      {
        "GET /marketplace/listings/556": {
          ...listingFixture,
          id: 556,
          status: "Sold",
          format_quantity: 0,
        },
      },
    );
    expect(soldRefused.code).toBe(2);
    expect(soldRefused.stderr).toContain("GROOVECTL_LISTING_STATUS_REQUIRED");
    expect(soldRefused.calls).toHaveLength(1);

    const zeroQtyUpdate = await invoke(
      ["marketplace", "listing", "update", "557", "--price", "15.00", "--json"],
      {
        "GET /marketplace/listings/557": {
          ...listingFixture,
          id: 557,
          status: "Draft",
          format_quantity: 0,
        },
        "POST /marketplace/listings/557": null,
      },
    );
    expect(zeroQtyUpdate.code).toBe(0);
    expect(zeroQtyUpdate.calls[1]?.body).not.toHaveProperty("format_quantity");

    const delBlocked = await invoke(
      ["marketplace", "listing", "delete", "555"],
      handlers,
    );
    expect(delBlocked.code).toBe(10);
    expect(delBlocked.calls).toHaveLength(0);

    const delOk = await invoke(
      ["marketplace", "listing", "delete", "555", "--yes", "--json"],
      handlers,
    );
    expect(delOk.code).toBe(0);
    expect(delOk.calls[0]?.method).toBe("DELETE");
  });

  it("reads, updates, and messages Marketplace orders", async () => {
    const orderFixture = {
      id: "12345-1",
      status: "Payment Received",
      next_status: ["Shipped"],
      created: "2026-10-10T10:00:00Z",
      last_activity: "2026-10-10T12:00:00Z",
      archived: false,
      buyer: { id: 100, username: "vinyl-buyer" },
      seller: { id: 8, username: "seller-me" },
      items: [
        {
          id: 555,
          release: { id: 7, description: "Miles Davis - Kind of Blue" },
          price: { value: 30, currency: "USD" },
        },
      ],
      shipping: { value: 5, currency: "USD", method: "Media Mail" },
      fee: { value: 2.7, currency: "USD" },
      total: { value: 35, currency: "USD" },
      shipping_address: "123 Vinyl Ave",
      additional_instructions: "Pack outside sleeve",
    };
    const messageFixture = {
      type: "message",
      subject: "Shipped",
      message: "Tracking #123",
      timestamp: "2026-10-11T08:00:00Z",
      from: { username: "seller-me" },
    };
    const handlers = {
      "GET /marketplace/orders": {
        pagination: { page: 1, pages: 1, per_page: 50, items: 1, urls: {} },
        orders: [orderFixture],
      },
      "GET /marketplace/orders/12345-1": orderFixture,
      "POST /marketplace/orders/12345-1": {
        ...orderFixture,
        status: "Shipped",
      },
      "GET /marketplace/orders/12345-1/messages": {
        pagination: { page: 1, pages: 1, per_page: 50, items: 1, urls: {} },
        messages: [messageFixture],
      },
      "POST /marketplace/orders/12345-1/messages": messageFixture,
    };

    const listRes = await invoke(
      [
        "marketplace",
        "orders",
        "list",
        "--status",
        "Payment Received",
        "--sort",
        "created",
        "--sort-order",
        "desc",
        "--archived",
        "--json",
      ],
      handlers,
    );
    expect(listRes.code).toBe(0);
    expect(listRes.calls[0]?.url.searchParams.get("archived")).toBe("true");
    expect(JSON.parse(listRes.stdout)).toMatchObject([
      {
        id: "12345-1",
        buyer: { username: "vinyl-buyer" },
        total: { value: 35 },
      },
    ]);

    const getRes = await invoke(
      ["marketplace", "orders", "get", "12345-1", "--format", "table"],
      handlers,
    );
    expect(getRes.code).toBe(0);
    expect(getRes.stdout).toContain("12345-1");

    const updDry = await invoke(
      [
        "marketplace",
        "orders",
        "update",
        "12345-1",
        "--status",
        "Shipped",
        "--shipping",
        "5.00",
        "--dry-run",
        "--json",
      ],
      handlers,
    );
    expect(updDry.code).toBe(0);
    expect(updDry.calls).toHaveLength(0);

    const updRes = await invoke(
      [
        "marketplace",
        "orders",
        "update",
        "12345-1",
        "--status",
        "Shipped",
        "--json",
      ],
      handlers,
    );
    expect(updRes.code).toBe(0);
    expect(JSON.parse(updRes.stdout)).toMatchObject({ status: "Shipped" });

    const msgsRes = await invoke(
      ["marketplace", "orders", "messages", "12345-1", "--all", "--json"],
      handlers,
    );
    expect(msgsRes.code).toBe(0);
    expect(JSON.parse(msgsRes.stdout)).toMatchObject([
      { from: "seller-me", message: "Tracking #123" },
    ]);

    const postMsgDry = await invoke(
      [
        "marketplace",
        "orders",
        "message",
        "12345-1",
        "--message",
        "Tracking #123",
        "--dry-run",
        "--json",
      ],
      handlers,
    );
    expect(postMsgDry.code).toBe(0);
    expect(postMsgDry.calls).toHaveLength(0);

    const postMsg = await invoke(
      [
        "marketplace",
        "orders",
        "message",
        "12345-1",
        "--message",
        "Tracking #123",
        "--json",
      ],
      handlers,
    );
    expect(postMsg.code).toBe(0);
    expect(postMsg.calls[0]).toMatchObject({
      method: "POST",
      body: { message: "Tracking #123" },
    });

    const emptyOrderUpd = await invoke(
      ["marketplace", "orders", "update", "12345-1"],
      handlers,
    );
    expect(emptyOrderUpd.code).toBe(2);

    const emptyOrderMsg = await invoke(
      ["marketplace", "orders", "message", "12345-1"],
      handlers,
    );
    expect(emptyOrderMsg.code).toBe(2);

    const nullishOrder = await invoke(
      ["marketplace", "orders", "get", "12345-2", "--json"],
      {
        "GET /marketplace/orders/12345-2": {
          id: "12345-2",
          status: "New Order",
          uri: "/sell/order/12345-2",
          resource_url: "",
          next_status: null,
          items: [],
          shipping: { value: null, currency: "USD", method: null },
        },
      },
    );
    expect(nullishOrder.code).toBe(0);
    expect(JSON.parse(nullishOrder.stdout)).toMatchObject({
      id: "12345-2",
      nextStatus: [],
      shipping: null,
      marketplaceUrl: "https://www.discogs.com/sell/order/12345-2",
      resourceUrl: "https://api.discogs.com/marketplace/orders/12345-2",
    });

    const nullishMsgs = await invoke(
      ["marketplace", "orders", "messages", "12345-2", "--json"],
      {
        "GET /marketplace/orders/12345-2/messages": {
          pagination: { page: 1, pages: 1, per_page: 50, items: 1, urls: {} },
          messages: [{ type: null, subject: null, message: null, from: null }],
        },
      },
    );
    expect(nullishMsgs.code).toBe(0);
    expect(JSON.parse(nullishMsgs.stdout)).toMatchObject([
      { type: "message", message: "", from: null },
    ]);
  });
});
