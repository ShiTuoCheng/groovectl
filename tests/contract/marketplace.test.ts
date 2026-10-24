import { describe, expect, it, vi } from "vitest";

import { MarketplaceService } from "../../src/app/marketplace-service.js";
import { DiscogsClient } from "../../src/discogs/client.js";
import { listingFixture, statsFixture } from "../fixtures/marketplace.js";

function fixtureService(body: unknown) {
  const fetch = vi.fn<typeof globalThis.fetch>(() =>
    Promise.resolve(Response.json(body)),
  );
  const client = new DiscogsClient({ userAgent: "Groovectl/test", fetch });
  return { service: new MarketplaceService(client), fetch };
}

describe("Marketplace API contract", () => {
  it("requests stats in the specified currency without requiring identity or auth", async () => {
    const { service, fetch } = fixtureService(statsFixture);
    await expect(service.getStats(7, "EUR")).resolves.toEqual({
      releaseId: 7,
      lowestPrice: { value: 12.5, currency: "EUR" },
      numForSale: 3,
      blockedFromSale: false,
      resourceUrl: "https://api.discogs.com/marketplace/stats/7",
      marketplaceUrl: "https://www.discogs.com/sell/release/7",
    });
    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, init] = fetch.mock.calls[0] ?? [];
    expect(url).toEqual(
      new URL("https://api.discogs.com/marketplace/stats/7?curr_abbr=EUR"),
    );
    expect(init?.method).toBe("GET");
    expect(new Headers(init?.headers).get("authorization")).toBeNull();
  });

  it.each([false, true])(
    "preserves nulls for unavailable/blocked releases (blocked=%s)",
    async (blocked) => {
      const { service, fetch } = fixtureService({
        lowest_price: null,
        num_for_sale: null,
        blocked_from_sale: blocked,
      });
      await expect(service.getStats(7)).resolves.toMatchObject({
        lowestPrice: null,
        numForSale: null,
        blockedFromSale: blocked,
      });
      expect(fetch.mock.calls[0]?.[0]).toEqual(
        new URL("https://api.discogs.com/marketplace/stats/7"),
      );
    },
  );

  it("normalizes listing prices and rating and strips private fields", async () => {
    const { service, fetch } = fixtureService(listingFixture);
    const value = await service.getListing(42, "EUR");
    expect(value).toEqual({
      id: 42,
      status: "For Sale",
      price: { value: 12.5, currency: "EUR" },
      originalPrice: { value: 14, currency: "USD" },
      shippingPrice: { value: 3, currency: "EUR" },
      condition: "Very Good Plus (VG+)",
      sleeveCondition: "Generic",
      comments: listingFixture.comments,
      postedAt: listingFixture.posted,
      shipsFrom: "Example Country",
      seller: { username: "fixture-seller", rating: 99.5 },
      release: { id: 7, description: "Fixture Artist - Fixture Release" },
      resourceUrl: listingFixture.resource_url,
      marketplaceUrl: listingFixture.uri,
    });
    expect(fetch.mock.calls[0]?.[0]).toEqual(
      new URL("https://api.discogs.com/marketplace/listings/42?curr_abbr=EUR"),
    );
    expect(JSON.stringify(value)).not.toContain("private-fixture");
    expect(value).not.toHaveProperty("in_cart");
  });

  it("maps absent optional fields to null without inventing shipping or ratings", async () => {
    const { service } = fixtureService({
      id: 42,
      status: "For Sale",
      price: { value: 0, currency: "USD" },
      condition: "Mint (M)",
      seller: { username: "fixture-seller" },
      release: { id: 7 },
    });
    await expect(service.getListing(42)).resolves.toMatchObject({
      shippingPrice: null,
      originalPrice: null,
      sleeveCondition: null,
      comments: null,
      postedAt: null,
      shipsFrom: null,
      seller: { username: "fixture-seller", rating: null },
      release: { id: 7, description: null },
      marketplaceUrl: "https://www.discogs.com/sell/item/42",
    });
  });

  it.each([undefined, "GBP"] as const)(
    "uses the documented fee path with currency %s",
    async (currency) => {
      const { service, fetch } = fixtureService({
        value: 1.23,
        currency: currency ?? "USD",
      });
      await expect(service.getFee("45.00", currency)).resolves.toEqual({
        price: { value: 45, currency: currency ?? "USD" },
        fee: { value: 1.23, currency: currency ?? "USD" },
      });
      expect(fetch.mock.calls[0]?.[0]).toEqual(
        new URL(
          `https://api.discogs.com/marketplace/fee/45.00${currency === undefined ? "" : `/${currency}`}`,
        ),
      );
    },
  );

  it.each(["stats", "listing", "fee"] as const)(
    "rejects malformed %s responses",
    async (kind) => {
      const { service } = fixtureService({ private: "must-not-leak" });
      const request =
        kind === "stats"
          ? service.getStats(7)
          : kind === "listing"
            ? service.getListing(42)
            : service.getFee("45");
      await expect(request).rejects.toMatchObject({
        code: "GROOVECTL_RESPONSE_SCHEMA_MISMATCH",
      });
    },
  );

  it.each([
    { ...statsFixture, num_for_sale: -1 },
    { ...statsFixture, lowest_price: { value: "12.50", currency: "EUR" } },
    { ...statsFixture, blocked_from_sale: "false" },
  ])("rejects invalid stats types", async (body) => {
    const { service } = fixtureService(body);
    await expect(service.getStats(7)).rejects.toMatchObject({
      code: "GROOVECTL_RESPONSE_SCHEMA_MISMATCH",
    });
  });
});
