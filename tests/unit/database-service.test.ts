import { describe, expect, it } from "vitest";

import { DatabaseService } from "../../src/app/database-service.js";
import { DiscogsClient } from "../../src/discogs/client.js";

describe("DatabaseService", () => {
  it("maps a Discogs release to the stable output model", async () => {
    const client = new DiscogsClient({
      userAgent: "Crateflow/test",
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
      title: "Kind of Blue",
      artists: ["Miles Davis"],
      year: 1959,
      country: "US",
      formats: ["Vinyl (LP, Album)"],
      genres: ["Jazz"],
      styles: ["Modal"],
      url: "https://www.discogs.com/release/249504-Miles-Davis-Kind-Of-Blue",
      resourceUrl: "https://api.discogs.com/releases/249504",
    });
  });
});
