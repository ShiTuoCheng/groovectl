import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { runCli } from "../../src/cli/run-cli.js";
import type { RuntimeDependencies } from "../../src/cli/runtime.js";

let directory: string;
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), "groovectl-cli-unit-"));
});
afterEach(async () => {
  await rm(directory, { recursive: true, force: true });
});

const identityBody = {
  id: 8,
  username: "fixture-user",
  resource_url: "https://api.discogs.com/users/fixture-user",
};

const basicInfoBody = {
  id: 7,
  title: "Kind of Blue",
  year: 1959,
  resource_url: "https://api.discogs.com/releases/7",
  artists: [{ name: "Miles Davis" }],
  formats: [{ name: "Vinyl", descriptions: ["LP"] }],
  labels: [{ name: "Columbia", catno: "CL 1355" }],
};

function apiRouter(overrides: Record<string, unknown> = {}) {
  const routes: Record<string, unknown> = {
    "/oauth/identity": identityBody,
    "/releases/7": {
      id: 7,
      title: "Kind of Blue",
      year: 1959,
      country: "US",
      uri: "/release/7",
      resource_url: "https://api.discogs.com/releases/7",
      artists: [{ name: "Miles Davis" }],
      formats: [{ name: "Vinyl", descriptions: ["LP"] }],
      genres: ["Jazz"],
      styles: ["Modal"],
    },
    "/masters/1": {
      id: 1,
      title: "Kind of Blue",
      year: 1959,
      main_release: 7,
      resource_url: "https://api.discogs.com/masters/1",
      uri: "/master/1",
      artists: [{ name: "Miles Davis" }],
      genres: ["Jazz"],
      styles: ["Modal"],
    },
    "/masters/1/versions": {
      pagination: { page: 1, pages: 1, per_page: 50, items: 1, urls: {} },
      versions: [
        {
          id: 7,
          title: "Kind of Blue",
          label: "Columbia",
          country: "US",
          released: "1959",
          major_formats: ["Vinyl"],
          catno: "CL 1355",
          resource_url: "https://api.discogs.com/releases/7",
        },
      ],
    },
    "/artists/2": {
      id: 2,
      name: "Miles Davis",
      realname: "Miles Dewey Davis III",
      profile: "Trumpeter",
      resource_url: "https://api.discogs.com/artists/2",
      uri: "/artist/2",
      urls: [],
      namevariations: [],
    },
    "/artists/2/releases": {
      pagination: { page: 1, pages: 1, per_page: 50, items: 1, urls: {} },
      releases: [
        {
          id: 1,
          title: "Kind of Blue",
          type: "master",
          artist: "Miles Davis",
          role: "Main",
          year: 1959,
          resource_url: "https://api.discogs.com/masters/1",
        },
      ],
    },
    "/labels/3": {
      id: 3,
      name: "Columbia",
      resource_url: "https://api.discogs.com/labels/3",
      uri: "/label/3",
      urls: [],
    },
    "/labels/3/releases": {
      pagination: { page: 1, pages: 1, per_page: 50, items: 1, urls: {} },
      releases: [
        {
          id: 7,
          title: "Kind of Blue",
          artist: "Miles Davis",
          year: 1959,
          format: "LP",
          catno: "CL 1355",
          status: "Accepted",
          resource_url: "https://api.discogs.com/releases/7",
        },
      ],
    },
    "/database/search": {
      pagination: { page: 1, pages: 1, per_page: 50, items: 1, urls: {} },
      results: [
        {
          id: 7,
          type: "release",
          title: "Miles Davis - Kind of Blue",
          year: "1959",
          country: "US",
          format: ["Vinyl"],
          label: ["Columbia"],
          genre: ["Jazz"],
          style: ["Modal"],
          catno: "CL 1355",
          resource_url: "https://api.discogs.com/releases/7",
        },
      ],
    },
    "/users/fixture-user/collection/folders": {
      folders: [
        {
          id: 0,
          name: "All",
          count: 1,
          resource_url:
            "https://api.discogs.com/users/fixture-user/collection/folders/0",
        },
      ],
    },
    "/users/fixture-user/collection/folders/0/releases": {
      pagination: { page: 1, pages: 1, per_page: 50, items: 1, urls: {} },
      releases: [
        {
          id: 7,
          instance_id: 42,
          folder_id: 1,
          rating: 5,
          date_added: "2026-01-01T00:00:00Z",
          notes: [],
          basic_information: basicInfoBody,
        },
      ],
    },
    "/users/fixture-user/collection/releases/7": {
      pagination: { page: 1, pages: 1, per_page: 50, items: 1, urls: {} },
      releases: [
        {
          id: 7,
          instance_id: 42,
          folder_id: 1,
          rating: 5,
          notes: [],
          basic_information: basicInfoBody,
        },
      ],
    },
    "/users/fixture-user/collection/value": {
      minimum: "$10.00",
      median: "$25.00",
      maximum: "$50.00",
    },
    "/users/fixture-user/collection/folders/1/releases/7/instances/42": null,
    "/users/fixture-user/wants": {
      pagination: { page: 1, pages: 1, per_page: 50, items: 1, urls: {} },
      wants: [
        {
          id: 7,
          rating: 5,
          notes: "Clean",
          resource_url: "https://api.discogs.com/users/fixture-user/wants/7",
          basic_information: basicInfoBody,
        },
      ],
    },
    "/users/fixture-user/wants/7": null,
    ...overrides,
  };
  const requestedUrls: URL[] = [];
  const fetch = vi.fn<typeof globalThis.fetch>((input) => {
    const url =
      input instanceof URL
        ? input
        : new URL(input instanceof Request ? input.url : input);
    requestedUrls.push(url);
    const body = routes[url.pathname];
    if (body === undefined) {
      return Promise.resolve(new Response(null, { status: 404 }));
    }
    if (body === null) {
      return Promise.resolve(new Response(null, { status: 204 }));
    }
    return Promise.resolve(Response.json(body));
  });
  return { fetch, requestedUrls };
}

async function invoke(
  args: string[],
  overrides: RuntimeDependencies = {},
  routes: Record<string, unknown> = {},
) {
  let stdout = "";
  let stderr = "";
  const { fetch, requestedUrls } = apiRouter(routes);
  let storedToken: string | undefined;
  const keyring = {
    get: vi.fn(() => Promise.resolve(storedToken)),
    set: vi.fn((token: string) => {
      storedToken = token;
      return Promise.resolve();
    }),
    delete: vi.fn(() => {
      const existed = storedToken !== undefined;
      storedToken = undefined;
      return Promise.resolve(existed);
    }),
  };
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
      },
      interactive: false,
      fetch,
      keyring,
      ...overrides,
    },
  );
  return { code, stdout, stderr, fetch, requestedUrls, keyring };
}

describe("CLI commands", () => {
  it("renders human-readable and JSON version output", async () => {
    const text = await invoke(["version"]);
    expect(text.code).toBe(0);
    expect(text.stdout).toMatch(/^groovectl \d+\.\d+\.\d+/u);

    const json = await invoke(["version", "--json"]);
    expect(json.code).toBe(0);
    expect(JSON.parse(json.stdout)).toMatchObject({
      platform: process.platform,
      arch: process.arch,
    });
  });

  it("manages auth login, status, and logout without printing tokens", async () => {
    const unauth = await invoke(["auth", "status", "--json"]);
    expect(unauth.code).toBe(0);
    expect(JSON.parse(unauth.stdout)).toEqual({ authenticated: false });

    const unauthText = await invoke(["auth", "status"]);
    expect(unauthText.stdout).toBe("Not authenticated.\n");

    let saved: string | undefined;
    const keyring = {
      get: vi.fn(() => Promise.resolve(saved)),
      set: vi.fn((token: string) => {
        saved = token;
        return Promise.resolve();
      }),
      delete: vi.fn(() => {
        const existed = saved !== undefined;
        saved = undefined;
        return Promise.resolve(existed);
      }),
    };

    const login = await invoke(["auth", "login"], {
      keyring,
      interactive: true,
      promptToken: () => Promise.resolve("secret-discogs-token"),
    });
    expect(login.code).toBe(0);
    expect(login.stdout).toBe("Authenticated as @fixture-user.\n");
    expect(login.stdout + login.stderr).not.toContain("secret-discogs-token");
    expect(saved).toBe("secret-discogs-token");

    const status = await invoke(["auth", "status"], { keyring });
    expect(status.code).toBe(0);
    expect(status.stdout).toBe("Authenticated as @fixture-user (keyring).\n");

    const statusJson = await invoke(["auth", "status", "--json"], { keyring });
    expect(JSON.parse(statusJson.stdout)).toEqual({
      authenticated: true,
      username: "fixture-user",
      source: "keyring",
    });

    const logoutFirst = await invoke(["auth", "logout"], { keyring });
    expect(logoutFirst.code).toBe(0);
    expect(logoutFirst.stdout).toContain("Local credential deleted.");

    const logoutSecond = await invoke(["auth", "logout"], { keyring });
    expect(logoutSecond.code).toBe(0);
    expect(logoutSecond.stdout).toBe("No local credential was stored.\n");
  });

  it("reads, updates, and validates config keys cleanly with exit code 2", async () => {
    const all = await invoke(["config", "get"]);
    expect(all.code).toBe(0);
    expect(JSON.parse(all.stdout)).toMatchObject({ format: "table" });

    const setFormat = await invoke(["config", "set", "format", "jsonl"]);
    expect(setFormat.code).toBe(0);
    expect(setFormat.stdout).toBe("format=jsonl\n");

    const getFormat = await invoke(["config", "get", "format"]);
    expect(getFormat.code).toBe(0);
    expect(getFormat.stdout).toBe("jsonl\n");

    const badKey = await invoke(["config", "get", "token"]);
    expect(badKey.code).toBe(2);
    expect(badKey.stderr).toContain("GROOVECTL_CONFIG_KEY_INVALID");

    const badSetKey = await invoke(["config", "set", "token", "abc"]);
    expect(badSetKey.code).toBe(2);
    expect(badSetKey.stderr).toContain("GROOVECTL_CONFIG_KEY_INVALID");

    const badEnum = await invoke(["config", "set", "format", "xml"]);
    expect(badEnum.code).toBe(2);
    expect(badEnum.stderr).toContain("GROOVECTL_CONFIG_VALUE_INVALID");

    const badInt = await invoke(["config", "set", "timeoutMs", "abc"]);
    expect(badInt.code).toBe(2);
    expect(badInt.stderr).toContain("GROOVECTL_CONFIG_VALUE_INVALID");

    const outOfRange = await invoke(["config", "set", "timeoutMs", "999999"]);
    expect(outOfRange.code).toBe(2);
    expect(outOfRange.stderr).toContain("GROOVECTL_CONFIG_VALUE_INVALID");
  });

  it("searches directly without an extra identity request and validates search arguments", async () => {
    const ok = await invoke(
      ["search", "Kind of Blue", "--type", "release", "--json"],
      {
        env: {
          NODE_ENV: "test",
          GROOVECTL_CONFIG_DIR: directory,
          DISCOGS_TOKEN: "fake-token",
        },
      },
    );
    expect(ok.code).toBe(0);
    expect(ok.requestedUrls.map((url) => url.pathname)).toEqual([
      "/database/search",
    ]);
    expect(JSON.parse(ok.stdout)).toMatchObject([{ id: 7 }]);

    for (const badArgs of [
      ["search"],
      ["search", ""],
      ["search", "   "],
      ["search", "Kind", "--per-page", "101"],
      ["search", "Kind", "--all", "--page", "2"],
      ["search", "Kind", "--json", "--output", "tsv"],
      ["search", "Kind", "--json", "--output", "table"],
      ["search", "Kind", "--fields", "unknownField"],
    ]) {
      const bad = await invoke(badArgs, {
        env: {
          NODE_ENV: "test",
          GROOVECTL_CONFIG_DIR: directory,
          DISCOGS_TOKEN: "fake-token",
        },
      });
      expect(bad.code).toBe(2);
      expect(bad.fetch).not.toHaveBeenCalled();
    }
  });

  it.each([
    [["release", "get", "7", "--json"], "/releases/7"],
    [["release", "get", "7", "--format", "table"], "/releases/7"],
    [["master", "get", "1", "--json"], "/masters/1"],
    [["master", "get", "1", "--format", "table"], "/masters/1"],
    [["master", "versions", "1", "--json"], "/masters/1/versions"],
    [["master", "versions", "1", "--format", "tsv"], "/masters/1/versions"],
    [["master", "versions", "1", "--all", "--json"], "/masters/1/versions"],
    [["artist", "get", "2", "--json"], "/artists/2"],
    [["artist", "get", "2", "--format", "table"], "/artists/2"],
    [["artist", "releases", "2", "--json"], "/artists/2/releases"],
    [["artist", "releases", "2", "--format", "tsv"], "/artists/2/releases"],
    [["artist", "releases", "2", "--all", "--json"], "/artists/2/releases"],
    [["label", "get", "3", "--json"], "/labels/3"],
    [["label", "get", "3", "--format", "table"], "/labels/3"],
    [["label", "releases", "3", "--json"], "/labels/3/releases"],
    [["label", "releases", "3", "--format", "tsv"], "/labels/3/releases"],
    [["label", "releases", "3", "--all", "--json"], "/labels/3/releases"],
  ])("executes public database read %j", async (args, expectedPath) => {
    const result = await invoke(args);
    expect(result.code).toBe(0);
    expect(result.requestedUrls[0]?.pathname).toBe(expectedPath);
    if (args.includes("--json")) {
      expect(() => JSON.parse(result.stdout) as unknown).not.toThrow();
    } else {
      expect(result.stdout.length).toBeGreaterThan(0);
    }
  });

  it.each([
    ["release", "get", "7"],
    ["master", "get", "1"],
    ["master", "versions", "1"],
    ["artist", "get", "2"],
    ["artist", "releases", "2"],
    ["label", "get", "3"],
    ["label", "releases", "3"],
    ["collection", "folders"],
    ["collection", "list"],
    ["collection", "contains", "7"],
    ["collection", "value"],
    ["wantlist", "list"],
  ])(
    "validates unknown --fields before making requests for %j",
    async (...args) => {
      const result = await invoke([...args, "--fields", "doesNotExist"], {
        env: {
          NODE_ENV: "test",
          GROOVECTL_CONFIG_DIR: directory,
          DISCOGS_TOKEN: "fake-token",
        },
      });
      expect(result.code).toBe(2);
      expect(result.stderr).toContain("GROOVECTL_FIELD_UNKNOWN");
      expect(result.fetch).not.toHaveBeenCalled();
    },
  );

  it("reads collection folders, list, contains, value and wantlist list", async () => {
    const authEnv = {
      env: {
        NODE_ENV: "test",
        GROOVECTL_CONFIG_DIR: directory,
        DISCOGS_TOKEN: "fake-token",
      },
    };
    for (const args of [
      ["search", "Kind of Blue", "--output", "tsv"],
      ["collection", "folders", "--format", "tsv"],
      [
        "collection",
        "list",
        "--sort",
        "added",
        "--sort-order",
        "desc",
        "--format",
        "tsv",
      ],
      ["collection", "list", "--all", "--json"],
      ["collection", "contains", "7", "--json"],
      ["collection", "value", "--format", "table"],
      ["collection", "add", "7", "--dry-run", "--format", "table"],
      ["wantlist", "list", "--format", "tsv"],
      ["wantlist", "list", "--all", "--json"],
      ["wantlist", "add", "7", "--dry-run", "--format", "table"],
    ]) {
      const res = await invoke(args, authEnv);
      expect(res.code).toBe(0);
      expect(res.stdout.length).toBeGreaterThan(0);
    }

    const emptyColUpdate = await invoke(
      ["collection", "update", "1", "7", "42"],
      authEnv,
    );
    expect(emptyColUpdate.code).toBe(2);
    expect(emptyColUpdate.stderr).toContain("GROOVECTL_USAGE");

    const emptyWantUpdate = await invoke(["wantlist", "update", "7"], authEnv);
    expect(emptyWantUpdate.code).toBe(2);
    expect(emptyWantUpdate.stderr).toContain("GROOVECTL_USAGE");

    const nonInteractiveRemove = await invoke(
      ["collection", "remove", "1", "7", "42"],
      authEnv,
    );
    expect(nonInteractiveRemove.code).toBe(10);
    expect(nonInteractiveRemove.stderr).toContain(
      "GROOVECTL_CONFIRMATION_REQUIRED",
    );
  });

  it("handles interactive confirmation approval and cancellation on destructive actions", async () => {
    const authEnv = {
      env: {
        NODE_ENV: "test",
        GROOVECTL_CONFIG_DIR: directory,
        DISCOGS_TOKEN: "fake-token",
      },
      interactive: true,
    };

    const cancelled = await invoke(["collection", "remove", "1", "7", "42"], {
      ...authEnv,
      confirm: () => Promise.resolve(false),
    });
    expect(cancelled.code).toBe(10);
    expect(cancelled.stderr).toContain("GROOVECTL_CANCELLED");
    expect(cancelled.requestedUrls).toHaveLength(1);

    const confirmed = await invoke(
      ["collection", "remove", "1", "7", "42", "--json"],
      {
        ...authEnv,
        confirm: () => Promise.resolve(true),
      },
    );
    expect(confirmed.code).toBe(0);
    expect(confirmed.requestedUrls).toHaveLength(2);
  });

  it("writes --verbose API diagnostics to injected stderr without secrets or query strings", async () => {
    const result = await invoke(
      ["--verbose", "search", "Kind of Blue", "--json"],
      {
        env: {
          NODE_ENV: "test",
          GROOVECTL_CONFIG_DIR: directory,
          DISCOGS_TOKEN: "super-secret-token",
        },
      },
    );
    expect(result.code).toBe(0);
    expect(result.stderr).toContain(
      "[groovectl] GET https://api.discogs.com/database/search",
    );
    expect(result.stderr).toMatch(/\[groovectl\] HTTP 200 in \d+ms/u);
    expect(result.stderr).not.toContain("super-secret-token");
    expect(result.stderr).not.toContain("Kind");
  });

  it("rejects API base URL overrides outside NODE_ENV=test", async () => {
    const result = await invoke(["release", "get", "7", "--json"], {
      env: {
        NODE_ENV: "production",
        GROOVECTL_API_BASE_URL: "http://127.0.0.1:9999",
      },
    });
    expect(result.code).toBe(2);
    expect(result.stderr).toContain("GROOVECTL_UNSAFE_BASE_URL");
    expect(result.fetch).not.toHaveBeenCalled();
  });
});
