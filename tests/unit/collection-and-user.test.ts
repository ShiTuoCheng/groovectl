import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { runCli } from "../../src/cli/run-cli.js";
import type { RuntimeDependencies } from "../../src/cli/runtime.js";

let directory: string;
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), "groovectl-col-user-"));
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
  handlers: Record<string, unknown>,
  extra: RuntimeDependencies = {},
  authenticated = true,
) {
  let stdout = "";
  let stderr = "";
  const { fetch, calls } = makeRouter({
    "GET /oauth/identity": {
      id: 8,
      username: "alice",
      resource_url: "https://api.discogs.com/users/alice",
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

describe("Pressing filters, release ratings, collection folders/fields/notes, user profile, and lists", () => {
  it("passes official Discogs filter and sort params to master versions and artist releases", async () => {
    const masterRes = await invoke(
      [
        "master",
        "versions",
        "5460",
        "--media-format",
        "Vinyl",
        "--country",
        "Japan",
        "--label",
        "CBS/Sony",
        "--released",
        "1978",
        "--sort",
        "released",
        "--sort-order",
        "asc",
        "--json",
      ],
      {
        "GET /masters/5460/versions": {
          pagination: {
            page: 1,
            pages: 1,
            per_page: 50,
            items: 1,
            urls: { next: null, prev: null },
          },
          versions: [
            {
              id: 777,
              title: "Kind of Blue",
              label: "CBS/Sony",
              country: "Japan",
              released: "1978",
              major_formats: ["Vinyl"],
              format: "LP, Album, Reissue",
              catno: "25AP 755",
              status: "Accepted",
              stats: { community: { in_collection: 840, in_wantlist: 312 } },
              resource_url: "https://api.discogs.com/releases/777",
            },
          ],
        },
      },
      {},
      false,
    );
    expect(masterRes.code).toBe(0);
    expect(masterRes.calls[0]?.url.searchParams.get("format")).toBe("Vinyl");
    expect(masterRes.calls[0]?.url.searchParams.get("country")).toBe("Japan");
    expect(masterRes.calls[0]?.url.searchParams.get("label")).toBe("CBS/Sony");
    expect(masterRes.calls[0]?.url.searchParams.get("released")).toBe("1978");
    expect(masterRes.calls[0]?.url.searchParams.get("sort")).toBe("released");
    expect(masterRes.calls[0]?.url.searchParams.get("sort_order")).toBe("asc");
    expect(JSON.parse(masterRes.stdout)).toMatchObject([
      { id: 777, catalogNumber: "25AP 755", have: 840, want: 312 },
    ]);

    const artistRes = await invoke(
      [
        "artist",
        "releases",
        "23755",
        "--sort",
        "year",
        "--sort-order",
        "desc",
        "--json",
      ],
      {
        "GET /artists/23755/releases": {
          pagination: { page: 1, pages: 1, per_page: 50, items: 1, urls: {} },
          releases: [
            {
              id: 5460,
              title: "Kind of Blue",
              type: "master",
              artist: "Miles Davis",
              role: "Main",
              year: 1959,
              resource_url: "https://api.discogs.com/masters/5460",
            },
          ],
        },
      },
      {},
      false,
    );
    expect(artistRes.code).toBe(0);
    expect(artistRes.calls[0]?.url.searchParams.get("sort")).toBe("year");
    expect(artistRes.calls[0]?.url.searchParams.get("sort_order")).toBe("desc");
  });

  it("reads, sets, and removes release ratings with dry-run and confirmation guards", async () => {
    const handlers = {
      "GET /releases/7/rating": {
        release_id: 7,
        rating: { count: 400, average: 4.75 },
      },
      "GET /releases/7/rating/alice": {
        username: "alice",
        release_id: 7,
        rating: 5,
      },
      "PUT /releases/7/rating/alice": {
        username: "alice",
        release_id: 7,
        rating: 4,
      },
      "DELETE /releases/7/rating/alice": null,
    };

    const community = await invoke(
      ["release", "rating", "get", "7", "--json"],
      handlers,
      {},
      false,
    );
    expect(community.code).toBe(0);
    expect(JSON.parse(community.stdout)).toEqual({
      releaseId: 7,
      average: 4.75,
      count: 400,
    });

    const mine = await invoke(
      ["release", "rating", "get", "7", "--mine", "--json"],
      handlers,
    );
    expect(mine.code).toBe(0);
    expect(JSON.parse(mine.stdout)).toEqual({
      releaseId: 7,
      username: "alice",
      rating: 5,
    });

    const drySet = await invoke(
      ["release", "rating", "set", "7", "4", "--dry-run", "--json"],
      handlers,
    );
    expect(drySet.code).toBe(0);
    expect(JSON.parse(drySet.stdout)).toMatchObject({
      action: "release.rating.set",
      rating: 4,
      dryRun: true,
    });
    expect(drySet.calls.map((c) => c.method)).toEqual(["GET"]);

    const setRes = await invoke(
      ["release", "rating", "set", "7", "4", "--json"],
      handlers,
    );
    expect(setRes.code).toBe(0);
    expect(setRes.calls[1]).toMatchObject({
      method: "PUT",
      body: { rating: 4 },
    });

    const invalidRating = await invoke(
      ["release", "rating", "set", "7", "6"],
      handlers,
    );
    expect(invalidRating.code).toBe(2);

    const noConfirm = await invoke(
      ["release", "rating", "remove", "7"],
      handlers,
    );
    expect(noConfirm.code).toBe(10);

    const delRes = await invoke(
      ["release", "rating", "remove", "7", "--yes", "--json"],
      handlers,
    );
    expect(delRes.code).toBe(0);
    expect(delRes.calls[1]?.method).toBe("DELETE");
  });

  it("manages custom collection folders, custom fields, notes, and local --query filters", async () => {
    const handlers = {
      "GET /users/alice/collection/folders/2": {
        id: 2,
        name: "Japanese Pressings",
        count: 14,
        resource_url:
          "https://api.discogs.com/users/alice/collection/folders/2",
      },
      "POST /users/alice/collection/folders": {
        id: 3,
        name: "Jazz Originals",
        count: 0,
        resource_url:
          "https://api.discogs.com/users/alice/collection/folders/3",
      },
      "POST /users/alice/collection/folders/2": {
        id: 2,
        name: "Japan OBI Vinyl",
        count: 14,
        resource_url:
          "https://api.discogs.com/users/alice/collection/folders/2",
      },
      "DELETE /users/alice/collection/folders/3": null,
      "GET /users/alice/collection/fields": {
        fields: [
          {
            id: 1,
            name: "Media Condition",
            type: "dropdown",
            position: 1,
            public: true,
            options: [
              "Mint (M)",
              "Near Mint (NM or M-)",
              "Very Good Plus (VG+)",
            ],
          },
          {
            id: 3,
            name: "Notes",
            type: "textarea",
            position: 3,
            lines: null,
            public: null,
            options: null,
          },
        ],
      },
      "POST /users/alice/collection/folders/1/releases/7/instances/42/fields/1":
        null,
      "GET /users/alice/collection/folders/0/releases": {
        pagination: { page: 1, pages: 1, per_page: 50, items: 2, urls: {} },
        releases: [
          {
            id: 7,
            instance_id: 42,
            folder_id: 1,
            rating: 5,
            notes: [{ field_id: 3, value: "With OBI strip" }],
            basic_information: {
              id: 7,
              title: "Kind of Blue",
              year: 1959,
              resource_url: "https://api.discogs.com/releases/7",
              artists: [{ name: "Miles Davis" }],
              labels: [{ name: "Columbia", catno: "CL 1355" }],
            },
          },
          {
            id: 8,
            instance_id: 43,
            folder_id: 1,
            rating: 4,
            notes: [],
            basic_information: {
              id: 8,
              title: "Time Out",
              year: 1959,
              resource_url: "https://api.discogs.com/releases/8",
              artists: [{ name: "Dave Brubeck" }],
              labels: [{ name: "Columbia", catno: "CL 1397" }],
            },
          },
        ],
      },
      "GET /users/alice/wants": {
        pagination: { page: 1, pages: 1, per_page: 50, items: 2, urls: {} },
        wants: [
          {
            id: 9,
            rating: 5,
            notes: "First mono pressing",
            resource_url: "https://api.discogs.com/users/alice/wants/9",
            basic_information: {
              id: 9,
              title: "Blue Train",
              year: 1958,
              resource_url: "https://api.discogs.com/releases/9",
              artists: [{ name: "John Coltrane" }],
              labels: [{ name: "Blue Note", catno: "BLP 1577" }],
            },
          },
          {
            id: 10,
            rating: 3,
            resource_url: "https://api.discogs.com/users/alice/wants/10",
            basic_information: {
              id: 10,
              title: "A Love Supreme",
              year: 1965,
              resource_url: "https://api.discogs.com/releases/10",
              artists: [{ name: "John Coltrane" }],
              labels: [{ name: "Impulse!", catno: "A-77" }],
            },
          },
        ],
      },
    };

    const folderGet = await invoke(
      ["collection", "folder", "get", "2", "--json"],
      handlers,
    );
    expect(folderGet.code).toBe(0);
    expect(JSON.parse(folderGet.stdout)).toMatchObject({
      id: 2,
      name: "Japanese Pressings",
    });

    const folderDry = await invoke(
      [
        "collection",
        "folder",
        "create",
        "Jazz Originals",
        "--dry-run",
        "--json",
      ],
      handlers,
    );
    expect(folderDry.code).toBe(0);
    expect(JSON.parse(folderDry.stdout)).toMatchObject({
      action: "collection.folder.create",
      folderName: "Jazz Originals",
      dryRun: true,
    });
    expect(folderDry.calls).toHaveLength(1);

    const folderCreate = await invoke(
      ["collection", "folder", "create", "Jazz Originals", "--json"],
      handlers,
    );
    expect(folderCreate.code).toBe(0);
    expect(folderCreate.calls[1]).toMatchObject({
      method: "POST",
      body: { name: "Jazz Originals" },
    });

    const renameSystem = await invoke(
      ["collection", "folder", "rename", "0", "Invalid"],
      handlers,
    );
    expect(renameSystem.code).toBe(2);
    expect(renameSystem.stderr).toContain("system folders");

    const folderRename = await invoke(
      ["collection", "folder", "rename", "2", "Japan OBI Vinyl", "--json"],
      handlers,
    );
    expect(folderRename.code).toBe(0);
    expect(JSON.parse(folderRename.stdout)).toMatchObject({
      id: 2,
      name: "Japan OBI Vinyl",
    });

    const deleteSystem = await invoke(
      ["collection", "folder", "delete", "0", "--yes"],
      handlers,
    );
    expect(deleteSystem.code).toBe(2);
    expect(deleteSystem.stderr).toContain("system folders");

    const deleteNoConfirm = await invoke(
      ["collection", "folder", "delete", "3"],
      handlers,
    );
    expect(deleteNoConfirm.code).toBe(10);

    const folderDelete = await invoke(
      ["collection", "folder", "delete", "3", "--yes", "--json"],
      handlers,
    );
    expect(folderDelete.code).toBe(0);
    expect(folderDelete.calls[1]?.method).toBe("DELETE");

    const fieldsRes = await invoke(
      ["collection", "fields", "--json"],
      handlers,
    );
    expect(fieldsRes.code).toBe(0);
    expect(JSON.parse(fieldsRes.stdout)).toMatchObject([
      { id: 1, name: "Media Condition", type: "dropdown" },
      { id: 3, name: "Notes", type: "textarea", lines: null, options: [] },
    ]);

    const noteDry = await invoke(
      [
        "collection",
        "note",
        "set",
        "1",
        "7",
        "42",
        "1",
        "Very Good Plus (VG+)",
        "--dry-run",
        "--json",
      ],
      handlers,
    );
    expect(noteDry.code).toBe(0);
    expect(noteDry.calls).toHaveLength(1);

    const noteSet = await invoke(
      [
        "collection",
        "note",
        "set",
        "1",
        "7",
        "42",
        "1",
        "Very Good Plus (VG+)",
        "--json",
      ],
      handlers,
    );
    expect(noteSet.code).toBe(0);
    expect(noteSet.calls[1]).toMatchObject({
      method: "POST",
      body: { value: "Very Good Plus (VG+)" },
    });

    const colQuery = await invoke(
      ["collection", "list", "--query", "OBI", "--json"],
      handlers,
    );
    expect(colQuery.code).toBe(0);
    expect(JSON.parse(colQuery.stdout)).toMatchObject([{ id: 7 }]);

    const wantQuery = await invoke(
      ["wantlist", "list", "--query", "BLP 1577", "--json"],
      handlers,
    );
    expect(wantQuery.code).toBe(0);
    expect(JSON.parse(wantQuery.stdout)).toMatchObject([{ id: 9 }]);
  });

  it("reads user profiles and user lists for both authenticated and public users", async () => {
    const handlers = {
      "GET /users/alice": {
        id: 8,
        username: "alice",
        name: "Alice Collector",
        location: "Tokyo",
        curr_abbr: "JPY",
        num_collection: 120,
        num_wantlist: 45,
        num_for_sale: 3,
        num_lists: 2,
        buyer_rating: 100,
        seller_rating: 99.5,
        resource_url: "https://api.discogs.com/users/alice",
        uri: "https://www.discogs.com/user/alice",
      },
      "GET /users/bob": {
        id: 9,
        username: "bob",
        resource_url: "https://api.discogs.com/users/bob",
      },
      "GET /users/alice/lists": {
        pagination: { page: 1, pages: 1, per_page: 50, items: 1, urls: {} },
        lists: [
          {
            id: 55,
            name: "Essential Jazz",
            description: "Core vinyl",
            public: true,
            resource_url: "https://api.discogs.com/lists/55",
            uri: "https://www.discogs.com/lists/Essential-Jazz/55",
          },
        ],
      },
      "GET /lists/55": {
        id: 55,
        name: "Essential Jazz",
        description: "Core vinyl",
        public: true,
        resource_url: "https://api.discogs.com/lists/55",
        items: [
          {
            id: 7,
            type: "release",
            display_title: "Miles Davis - Kind of Blue",
            comment: "Must own",
            uri: "/release/7",
            resource_url: "https://api.discogs.com/releases/7",
          },
        ],
      },
    };

    const selfProfile = await invoke(["user", "profile", "--json"], handlers);
    expect(selfProfile.code).toBe(0);
    expect(JSON.parse(selfProfile.stdout)).toMatchObject({
      username: "alice",
      currency: "JPY",
      numCollection: 120,
      numWantlist: 45,
    });

    const publicProfile = await invoke(
      ["user", "profile", "bob", "--format", "table"],
      handlers,
      {},
      false,
    );
    expect(publicProfile.code).toBe(0);
    expect(publicProfile.stdout).toContain("bob");

    const lists = await invoke(["list", "ls", "--all", "--json"], handlers);
    expect(lists.code).toBe(0);
    expect(JSON.parse(lists.stdout)).toMatchObject([
      { id: 55, name: "Essential Jazz" },
    ]);

    const listDetail = await invoke(
      ["list", "get", "55", "--json"],
      handlers,
      {},
      false,
    );
    expect(listDetail.code).toBe(0);
    expect(JSON.parse(listDetail.stdout)).toMatchObject({
      id: 55,
      items: [
        { id: 7, title: "Miles Davis - Kind of Blue", comment: "Must own" },
      ],
    });
    const emptyUser = await invoke(
      ["user", "profile", "   "],
      handlers,
      {},
      false,
    );
    expect(emptyUser.code).toBe(2);
    expect(emptyUser.calls).toHaveLength(0);

    const emptyListUser = await invoke(["list", "ls", ""], handlers, {}, false);
    expect(emptyListUser.code).toBe(2);
    expect(emptyListUser.calls).toHaveLength(0);
  });
});
