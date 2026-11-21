import { describe, expect, it } from "vitest";

import { DatabaseService } from "../../src/app/database-service.js";
import { DiscogsClient } from "../../src/discogs/client.js";

describe("DatabaseService", () => {
  it("maps a minimal Discogs release with safe defaults", async () => {
    const client = new DiscogsClient({
      userAgent: "Groovectl/test",
      fetch: () =>
        Promise.resolve(
          new Response(
            JSON.stringify({
              id: 249504,
              title: "Kind of Blue",
              year: 1959,
              country: "US",
              uri: "/release/249504-Miles-Davis-Kind-Of-Blue",
              resource_url: "https://api.discogs.com/releases/249504",
              artists: [{ name: "Miles Davis" }],
              formats: [{ name: "Vinyl", descriptions: ["LP", "Album"] }],
              genres: ["Jazz"],
              styles: ["Modal"],
            }),
            { status: 200, headers: { "content-type": "application/json" } },
          ),
        ),
    });

    await expect(
      new DatabaseService(client).getRelease(249504),
    ).resolves.toEqual({
      id: 249504,
      masterId: null,
      title: "Kind of Blue",
      artists: ["Miles Davis"],
      year: 1959,
      released: null,
      country: "US",
      status: null,
      dataQuality: null,
      formats: ["Vinyl (LP, Album)"],
      labels: [],
      companies: [],
      identifiers: [],
      tracklist: [],
      notes: null,
      genres: ["Jazz"],
      styles: ["Modal"],
      community: null,
      lowestPrice: null,
      numForSale: null,
      url: "https://www.discogs.com/release/249504-Miles-Davis-Kind-Of-Blue",
      resourceUrl: "https://api.discogs.com/releases/249504",
    });
  });

  it("maps full pressing identification metadata, tracklist, community stats, and currency", async () => {
    const requestedUrls: URL[] = [];
    const client = new DiscogsClient({
      userAgent: "Groovectl/test",
      fetch: (input) => {
        requestedUrls.push(
          input instanceof URL
            ? input
            : new URL(input instanceof Request ? input.url : input),
        );
        return Promise.resolve(
          Response.json({
            id: 249504,
            master_id: 5460,
            title: "Kind of Blue",
            year: 1959,
            released: "1959-08-17",
            released_formatted: "17 Aug 1959",
            country: "US",
            status: "Accepted",
            data_quality: "Correct",
            notes: "6-eye Columbia label, first pressing.",
            lowest_price: 45.5,
            num_for_sale: 18,
            uri: "/release/249504-Miles-Davis-Kind-Of-Blue",
            resource_url: "https://api.discogs.com/releases/249504",
            artists: [{ name: "Miles Davis" }],
            formats: [
              {
                name: "Vinyl",
                qty: "2",
                descriptions: ["LP", "Album"],
                text: "180g Gatefold",
              },
            ],
            labels: [{ name: "Columbia", catno: "CL 1355" }],
            companies: [
              {
                name: "Columbia Records Pressing Plant, Terre Haute",
                entity_type_name: "Pressed By",
                catno: "",
              },
            ],
            identifiers: [
              {
                type: "Matrix / Runout",
                value: "XLP 47324-1A",
                description: "Side A stamped",
              },
              { type: "Barcode", value: "07464081631" },
            ],
            tracklist: [
              {
                position: "A1",
                title: "So What",
                duration: "9:22",
                type_: "track",
              },
            ],
            community: {
              have: 12000,
              want: 4500,
              rating: { count: 980, average: 4.82 },
            },
            genres: ["Jazz"],
            styles: ["Modal"],
          }),
        );
      },
    });

    await expect(
      new DatabaseService(client).getRelease(249504, "USD"),
    ).resolves.toMatchObject({
      id: 249504,
      masterId: 5460,
      released: "17 Aug 1959",
      status: "Accepted",
      dataQuality: "Correct",
      formats: ["2x Vinyl (LP, Album, 180g Gatefold)"],
      labels: [{ name: "Columbia", catalogNumber: "CL 1355" }],
      companies: [
        {
          name: "Columbia Records Pressing Plant, Terre Haute",
          entityType: "Pressed By",
          catalogNumber: null,
        },
      ],
      identifiers: [
        {
          type: "Matrix / Runout",
          value: "XLP 47324-1A",
          description: "Side A stamped",
        },
        { type: "Barcode", value: "07464081631", description: null },
      ],
      tracklist: [
        { position: "A1", title: "So What", duration: "9:22", type: "track" },
      ],
      notes: "6-eye Columbia label, first pressing.",
      community: {
        have: 12000,
        want: 4500,
        ratingAverage: 4.82,
        ratingCount: 980,
      },
      lowestPrice: 45.5,
      numForSale: 18,
    });
    expect(requestedUrls[0]).toEqual(
      new URL("https://api.discogs.com/releases/249504?curr_abbr=USD"),
    );
  });
});
