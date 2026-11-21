import { describe, expect, it, vi } from "vitest";

import { CollectionService } from "../../src/app/collection-service.js";
import { DatabaseService } from "../../src/app/database-service.js";
import { WantlistService } from "../../src/app/wantlist-service.js";
import { DiscogsClient } from "../../src/discogs/client.js";

function clientFor(responses: Record<string, unknown>) {
  const fetch = vi.fn<typeof globalThis.fetch>((input) => {
    const url =
      input instanceof URL
        ? input
        : new URL(input instanceof Request ? input.url : input);
    const key = `${url.pathname}${url.search}`;
    const body = responses[key] ?? responses[url.pathname];
    if (body === undefined) {
      return Promise.resolve(new Response(null, { status: 404 }));
    }
    if (body === null) {
      return Promise.resolve(new Response(null, { status: 204 }));
    }
    return Promise.resolve(Response.json(body));
  });
  return {
    client: new DiscogsClient({
      userAgent: "Groovectl/test",
      token: "fake-token",
      fetch,
    }),
    fetch,
  };
}

async function collect<T>(values: AsyncIterable<T>): Promise<T[]> {
  const items: T[] = [];
  for await (const item of values) items.push(item);
  return items;
}

describe("DatabaseService", () => {
  it("maps master, artist, label, and search resources including paginated streams", async () => {
    const { client } = clientFor({
      "/masters/1": {
        id: 1,
        title: "Master Album",
        year: 1970,
        main_release: 10,
        resource_url: "https://api.discogs.com/masters/1",
        uri: "/master/1-Master-Album",
        artists: [{ name: "Artist A" }],
        genres: ["Jazz"],
        styles: ["Fusion"],
      },
      "/masters/1/versions?per_page=1": {
        pagination: {
          page: 1,
          pages: 2,
          per_page: 1,
          items: 2,
          urls: {
            next: "https://api.discogs.com/masters/1/versions?page=2&per_page=1",
          },
        },
        versions: [
          {
            id: 10,
            title: "First Press",
            label: "Blue Note",
            country: "US",
            released: "1970",
            major_formats: ["Vinyl"],
            format: "LP",
            catno: "BN-1",
            status: "Accepted",
            resource_url: "https://api.discogs.com/releases/10",
          },
        ],
      },
      "/masters/1/versions?page=2&per_page=1": {
        pagination: { page: 2, pages: 2, per_page: 1, items: 2, urls: {} },
        versions: [
          {
            id: 11,
            title: "Reissue",
            resource_url: "https://api.discogs.com/releases/11",
          },
        ],
      },
      "/artists/2": {
        id: 2,
        name: "Artist A",
        realname: "Real Name",
        profile: "Bio",
        resource_url: "https://api.discogs.com/artists/2",
        uri: "",
        urls: ["https://example.com"],
        namevariations: ["A. Artist"],
      },
      "/artists/2/releases?per_page=50": {
        pagination: { page: 1, pages: 1, per_page: 50, items: 1, urls: {} },
        releases: [
          {
            id: 1,
            title: "Master Album",
            type: "master",
            main_release: 10,
            artist: "Artist A",
            role: "Main",
            year: 1970,
            resource_url: "https://api.discogs.com/masters/1",
          },
        ],
      },
      "/labels/3": {
        id: 3,
        name: "Blue Note",
        profile: "Jazz label",
        contact_info: "NYC",
        resource_url: "https://api.discogs.com/labels/3",
        uri: "/label/3-Blue-Note",
        urls: ["https://example.com/label"],
        parent_label: { id: 99, name: "Capitol" },
      },
      "/labels/3/releases?per_page=50": {
        pagination: { page: 1, pages: 1, per_page: 50, items: 1, urls: {} },
        releases: [
          {
            id: 10,
            title: "First Press",
            artist: "Artist A",
            year: 1970,
            format: "LP",
            catno: "BN-1",
            status: "Accepted",
            resource_url: "https://api.discogs.com/releases/10",
          },
        ],
      },
      "/database/search?q=Master": {
        pagination: { page: 1, pages: 1, per_page: 50, items: 1, urls: {} },
        results: [
          {
            id: 10,
            type: "release",
            title: "Artist A - Master Album",
            year: "1970",
            country: "US",
            format: ["Vinyl"],
            label: ["Blue Note"],
            genre: ["Jazz"],
            style: ["Fusion"],
            catno: "BN-1",
            resource_url: "https://api.discogs.com/releases/10",
          },
        ],
      },
    });

    const service = new DatabaseService(client);
    await expect(service.getMaster(1)).resolves.toMatchObject({
      id: 1,
      mainReleaseId: 10,
      url: "https://www.discogs.com/master/1-Master-Album",
    });
    await expect(
      collect(service.getMasterVersionsAll(1, { per_page: 1 })),
    ).resolves.toMatchObject([
      { id: 10, label: "Blue Note", catalogNumber: "BN-1" },
      { id: 11, label: null, catalogNumber: null },
    ]);
    await expect(service.getArtist(2)).resolves.toMatchObject({
      id: 2,
      realName: "Real Name",
      url: "https://www.discogs.com/artist/2",
    });
    await expect(
      collect(service.getArtistReleasesAll(2, { per_page: 50 })),
    ).resolves.toMatchObject([
      {
        id: 1,
        type: "master",
        mainReleaseId: 10,
        url: "https://www.discogs.com/master/1",
      },
    ]);
    await expect(service.getLabel(3)).resolves.toMatchObject({
      id: 3,
      parentLabel: { id: 99, name: "Capitol" },
    });
    await expect(
      collect(service.getLabelReleasesAll(3, { per_page: 50 })),
    ).resolves.toMatchObject([
      {
        id: 10,
        catalogNumber: "BN-1",
        url: "https://www.discogs.com/release/10",
      },
    ]);
    await expect(service.search({ q: "Master" })).resolves.toMatchObject([
      {
        id: 10,
        catalogNumber: "BN-1",
        url: "https://www.discogs.com/release/10",
      },
    ]);
    await expect(
      collect(service.searchAll({ q: "Master" })),
    ).resolves.toHaveLength(1);
  });

  it("rejects cyclic pagination URLs instead of looping forever", async () => {
    const { client } = clientFor({
      "/database/search?q=Loop": {
        pagination: {
          page: 1,
          pages: 2,
          per_page: 1,
          items: 2,
          urls: { next: "https://api.discogs.com/database/search?q=Loop" },
        },
        results: [],
      },
    });
    await expect(
      collect(new DatabaseService(client).searchAll({ q: "Loop" })),
    ).rejects.toMatchObject({ code: "GROOVECTL_PAGINATION_INVALID" });
  });
});

describe("CollectionService and WantlistService", () => {
  const basicInfo = {
    id: 7,
    title: "Kind of Blue",
    year: 1959,
    resource_url: "https://api.discogs.com/releases/7",
    thumb: "",
    cover_image: "https://img.discogs.com/cover.jpg",
    artists: [{ name: "Miles Davis" }],
    formats: [{ name: "Vinyl", descriptions: ["LP", "Album"] }, { name: "CD" }],
    labels: [{ name: "Columbia", catno: "CL 1355" }],
  };

  it("maps collection folders, items, mutations, and wantlist records", async () => {
    const collectionItem = {
      id: 7,
      instance_id: 101,
      folder_id: 1,
      rating: 5,
      date_added: "2026-01-01T00:00:00-08:00",
      notes: [{ field_id: 3, value: "Clean copy" }],
      basic_information: basicInfo,
    };
    const wantlistItem = {
      id: 7,
      rating: 4,
      notes: "Original pressing",
      resource_url: "https://api.discogs.com/users/alice/wants/7",
      basic_information: basicInfo,
    };
    const { client } = clientFor({
      "/users/alice/collection/folders": {
        folders: [
          {
            id: 0,
            name: "All",
            count: 1,
            resource_url:
              "https://api.discogs.com/users/alice/collection/folders/0",
          },
        ],
      },
      "/users/alice/collection/folders/0/releases": {
        pagination: { page: 1, pages: 1, per_page: 50, items: 1, urls: {} },
        releases: [collectionItem],
      },
      "/users/alice/collection/releases/7": {
        pagination: { page: 1, pages: 1, per_page: 50, items: 1, urls: {} },
        releases: [collectionItem],
      },
      "/users/alice/collection/folders/1/releases/7": {
        instance_id: 101,
        resource_url:
          "https://api.discogs.com/users/alice/collection/folders/1/releases/7/instances/101",
      },
      "/users/alice/collection/folders/1/releases/7/instances/101": null,
      "/users/alice/wants": {
        pagination: { page: 1, pages: 1, per_page: 50, items: 1, urls: {} },
        wants: [wantlistItem],
      },
      "/users/alice/wants/7": wantlistItem,
    });

    const collection = new CollectionService(client);
    await expect(collection.folders("alice")).resolves.toMatchObject([
      { id: 0, name: "All", count: 1 },
    ]);
    await expect(collection.list("alice", 0, {})).resolves.toMatchObject([
      {
        id: 7,
        instanceId: 101,
        formats: ["Vinyl (LP, Album)", "CD"],
        catalogNumbers: ["CL 1355"],
        thumbnailUrl: null,
        coverImageUrl: "https://img.discogs.com/cover.jpg",
        notes: [{ fieldId: 3, value: "Clean copy" }],
      },
    ]);
    await expect(
      collect(collection.listAll("alice", 0, {})),
    ).resolves.toHaveLength(1);
    await expect(collection.contains("alice", 7)).resolves.toHaveLength(1);
    await expect(collection.add("alice", 1, 7)).resolves.toMatchObject({
      releaseId: 7,
      folderId: 1,
      instanceId: 101,
    });
    await expect(
      collection.update("alice", 1, 7, 101, { rating: 5 }),
    ).resolves.toBeUndefined();
    await expect(
      collection.remove("alice", 1, 7, 101),
    ).resolves.toBeUndefined();

    const wantlist = new WantlistService(client);
    await expect(wantlist.list("alice", {})).resolves.toMatchObject([
      { id: 7, rating: 4, notes: "Original pressing" },
    ]);
    await expect(collect(wantlist.listAll("alice", {}))).resolves.toHaveLength(
      1,
    );
    await expect(
      wantlist.add("alice", 7, { rating: 4 }),
    ).resolves.toMatchObject({ id: 7, rating: 4 });
    await expect(
      wantlist.update("alice", 7, { notes: "Original pressing" }),
    ).resolves.toMatchObject({ id: 7, notes: "Original pressing" });
  });

  it.each([
    {
      raw: { minimum: "$1,234.50", median: "CA$50.00", maximum: "A$75.25" },
      expected: {
        minimum: { value: 1234.5, currency: "USD", display: "$1,234.50" },
        median: { value: 50, currency: "CAD", display: "CA$50.00" },
        maximum: { value: 75.25, currency: "AUD", display: "A$75.25" },
      },
    },
    {
      raw: { minimum: "€10.00", median: "£20.00", maximum: "¥3,000" },
      expected: {
        minimum: { value: 10, currency: "EUR", display: "€10.00" },
        median: { value: 20, currency: "GBP", display: "£20.00" },
        maximum: { value: 3000, currency: "JPY", display: "¥3,000" },
      },
    },
    {
      raw: { minimum: "CHF 12.50", median: "NZ$40.00", maximum: "N/A" },
      expected: {
        minimum: { value: 12.5, currency: "CHF", display: "CHF 12.50" },
        median: { value: 40, currency: "NZD", display: "NZ$40.00" },
        maximum: { value: null, currency: null, display: "N/A" },
      },
    },
    {
      raw: { minimum: "", median: "R$99.90", maximum: "MX$150.00" },
      expected: {
        minimum: { value: null, currency: null, display: "" },
        median: { value: 99.9, currency: "BRL", display: "R$99.90" },
        maximum: { value: 150, currency: "MXN", display: "MX$150.00" },
      },
    },
    {
      raw: { minimum: "HK$10.00", median: "US$20.00", maximum: "$30.00" },
      expected: {
        minimum: { value: 10, currency: null, display: "HK$10.00" },
        median: { value: 20, currency: "USD", display: "US$20.00" },
        maximum: { value: 30, currency: "USD", display: "$30.00" },
      },
    },
  ])(
    "parses collection value currencies safely: $raw.minimum / $raw.median / $raw.maximum",
    async ({ raw, expected }) => {
      const { client } = clientFor({ "/users/alice/collection/value": raw });
      await expect(
        new CollectionService(client).value("alice"),
      ).resolves.toEqual(expected);
    },
  );
});
