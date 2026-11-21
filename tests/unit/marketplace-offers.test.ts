import { mkdtemp, rm, truncate, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MarketplaceOffers } from "../../src/app/marketplace-offers.js";
import { runCli } from "../../src/cli/run-cli.js";
import { parseMarketplacePage } from "../../src/discogs/marketplace-page.js";
import { marketplacePage, offerRow } from "../fixtures/marketplace-page.js";

let directory: string;
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), "groovectl-offers-"));
});
afterEach(async () => {
  await rm(directory, { recursive: true, force: true });
});

function htmlResponse(html: string): Response {
  return new Response(html, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

async function invoke(
  args: string[],
  fetch = vi.fn<typeof globalThis.fetch>(() =>
    Promise.resolve(htmlResponse(marketplacePage())),
  ),
  globalArgs: string[] = [],
) {
  let stdout = "";
  let stderr = "";
  const keyring = { get: vi.fn(), set: vi.fn(), delete: vi.fn() };
  const code = await runCli(
    [...globalArgs, "marketplace", "listings", "7", ...args],
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
      fetch,
      keyring,
      interactive: false,
      env: {
        NODE_ENV: "test",
        GROOVECTL_CONFIG_DIR: directory,
        DISCOGS_TOKEN: "private-test-token",
      },
    },
  );
  return { code, stdout, stderr, fetch, keyring };
}

describe("Marketplace HTML parser", () => {
  it("reads listing links and original prices without tooltip or converted-price contamination", () => {
    const page = parseMarketplacePage(
      marketplacePage(),
      7,
      "https://www.discogs.com/sell/release/7",
      "html",
    );
    expect(page).toMatchObject({
      start: 1,
      end: 1,
      total: 1,
      items: [
        {
          id: 42,
          releaseId: 7,
          price: { value: 80, currency: "GBP" },
          condition: "Very Good Plus (VG+)",
          sleeveCondition: "Near Mint (NM or M-)",
          comments: "Play tested. Sleeve is intact & complete.",
          shippingText: null,
          seller: {
            username: "fixture-seller",
            rating: 99.5,
            feedbackCount: 1234,
          },
          marketplaceUrl: "https://www.discogs.com/sell/item/42",
          source: "html",
        },
      ],
    });
  });

  it.each([
    "<html><h1>Verify you are human</h1></html>",
    marketplacePage().replace('data-release-id="7"', 'data-release-id="8"'),
    marketplacePage().replace(
      "/sell/item/42",
      "https://evil.example/sell/item/42",
    ),
    marketplacePage().replace("/sell/item/42", "http://[::1"),
    marketplacePage().replace(
      'data-pricevalue="80.00"',
      'data-pricevalue="NaN"',
    ),
    marketplacePage().replace("1 – 1 of 1", "1 – 2 of 2"),
    marketplacePage([offerRow(), offerRow()]),
    marketplacePage().replace('data-currency="GBP"', 'data-currency=""'),
    marketplacePage().replace("Very Good Plus (VG+)", "Changed grading markup"),
  ])(
    "rejects unrecognized, wrong-edition or incomplete HTML instead of returning no offers",
    (html) => {
      expect(() =>
        parseMarketplacePage(
          html,
          7,
          "https://www.discogs.com/sell/release/7",
          "html",
        ),
      ).toThrow(/not a recognized Marketplace page/u);
    },
  );

  it.each([
    marketplacePage([], 0, 0),
    marketplacePage([], 0, 0).replace("0 – 0 of 0", "0 of 0"),
    marketplacePage([], 0, 0).replace("0 – 0 of 0", "0"),
  ])("accepts an explicitly empty result page", (html) => {
    expect(
      parseMarketplacePage(
        html,
        7,
        "https://www.discogs.com/sell/release/7",
        "web",
      ).items,
    ).toEqual([]);
  });

  it("detects multiline unavailable text in the cart cell", () => {
    const html = marketplacePage([offerRow({ unavailable: true })]).replace(
      "Unavailable in United Kingdom",
      "Unavailable\n  in United Kingdom",
    );
    expect(
      parseMarketplacePage(
        html,
        7,
        "https://www.discogs.com/sell/release/7",
        "html",
      ).items[0]?.availability,
    ).toBe("unavailable");
  });

  it("accepts a PJAX fragment without a document shell or profile heading", () => {
    const fragment = marketplacePage()
      .replace(/<html[^>]*><head>.*?<\/head><body>/u, "")
      .replace(/<h1[^>]*>.*?<\/h1>/u, "")
      .replace("</body></html>", "");
    expect(
      parseMarketplacePage(
        fragment,
        7,
        "https://www.discogs.com/sell/release/7",
        "web",
      ),
    ).toMatchObject({ start: 1, end: 1, total: 1, items: [{ id: 42 }] });
  });
});

describe("marketplace listings CLI", () => {
  it("returns structured offers without reading credentials or forwarding the token", async () => {
    const result = await invoke(["--json", "--ships-from", "United Kingdom"]);
    expect(result.code).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject([
      { id: 42, source: "web" },
    ]);
    expect(result.stderr).toContain("Reading one page");
    expect(result.keyring.get).not.toHaveBeenCalled();
    expect(result.fetch).toHaveBeenCalledTimes(1);
    const init = result.fetch.mock.calls[0]?.[1];
    expect(init?.redirect).toBe("error");
    expect(new Headers(init?.headers).get("authorization")).toBeNull();
    expect(new Headers(init?.headers).get("cookie")).toBeNull();
    expect(new Headers(init?.headers).get("x-pjax")).toBe("true");
    expect(new Headers(init?.headers).get("x-pjax-container")).toBe(
      "#pjax_container",
    );
    expect(result.fetch.mock.calls[0]?.[0]).toEqual(
      new URL(
        "https://www.discogs.com/sell/release/7?page=1&limit=50&sort=price%2Casc&ships_from=United+Kingdom&_pjax=%23pjax_container",
      ),
    );
  });

  it("filters country, currency, both grades, price, rating and unavailability without guessing unknowns", async () => {
    const rows = [
      offerRow(),
      offerRow({ id: 43, country: "United States" }),
      offerRow({ id: 44, currency: "USD", price: "5" }),
      offerRow({ id: 45, condition: "Very Good (VG)" }),
      offerRow({ id: 46, sleeve: "Generic" }),
      offerRow({ id: 47, price: "101" }),
      offerRow({ id: 48, rating: "95%" }),
      offerRow({ id: 49, unavailable: true }),
      offerRow({ id: 50, rating: "" }),
    ];
    const result = await invoke(
      [
        "--json",
        "--ships-from",
        "United Kingdom",
        "--currency",
        "GBP",
        "--min-media",
        "VG+",
        "--min-sleeve",
        "VG+",
        "--max-price",
        "100",
        "--min-seller-rating",
        "99",
      ],
      vi.fn(() => Promise.resolve(htmlResponse(marketplacePage(rows)))),
    );
    expect(result.code).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject([{ id: 42 }]);
    expect(JSON.parse(result.stdout)).toHaveLength(1);
  });

  it("includes unavailable offers when --include-unavailable is passed", async () => {
    const rows = [
      offerRow({ id: 42 }),
      offerRow({ id: 49, unavailable: true }),
    ];
    const result = await invoke(
      ["--include-unavailable", "--json"],
      vi.fn(() => Promise.resolve(htmlResponse(marketplacePage(rows)))),
    );
    expect(result.code).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject([
      { id: 42, availability: "listed" },
      { id: 49, availability: "unavailable" },
    ]);
  });

  it("supports --page and --per-page on live reads", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(() =>
      Promise.resolve(
        htmlResponse(marketplacePage([offerRow({ id: 52 })], 3, 4)),
      ),
    );
    const result = await invoke(
      ["--page", "2", "--per-page", "2", "--json"],
      fetch,
    );
    expect(result.code).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject([{ id: 52 }]);
    expect(fetch.mock.calls[0]?.[0]).toEqual(
      new URL(
        "https://www.discogs.com/sell/release/7?page=2&limit=2&sort=price%2Casc&_pjax=%23pjax_container",
      ),
    );
  });

  it("honors stored output format configuration", async () => {
    await writeFile(
      join(directory, "config.json"),
      JSON.stringify({ format: "jsonl" }),
    );
    const result = await invoke([]);
    expect(result.code).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({ id: 42, source: "web" });
  });

  it("writes sanitized diagnostics without query values when --verbose is enabled", async () => {
    const result = await invoke(
      ["--ships-from", "United Kingdom", "--json"],
      undefined,
      ["--verbose"],
    );
    expect(result.code).toBe(0);
    expect(result.stderr).toContain(
      "[groovectl] GET https://www.discogs.com/sell/release/7",
    );
    expect(result.stderr).toMatch(/\[groovectl\] HTTP 200 in \d+ms/u);
    expect(result.stderr).not.toContain("ships_from=");
    expect(result.stderr).not.toContain("private-test-token");
  });

  it.each(["table", "tsv", "jsonl"])(
    "supports %s and field projection",
    async (format) => {
      const result = await invoke([
        "--format",
        format,
        "--fields",
        "id,marketplaceUrl",
      ]);
      expect(result.code).toBe(0);
      expect(result.stdout).toContain("https://www.discogs.com/sell/item/42");
      expect(result.stdout).not.toContain("fixture-seller");
    },
  );

  it.each([
    ["--max-price", "100"],
    ["--min-media", "EX"],
    ["--min-seller-rating", "101"],
    ["--min-seller-rating", "-1"],
    ["--ships-from", " "],
    ["--all", "--page", "2"],
    ["--html", "page.html", "--all"],
    ["--html", "page.html", "--page", "2"],
    ["--html", "page.html", "--sort", "listed-desc"],
    ["--fields", "notAField"],
    ["--per-page", "101"],
    ["--json", "--format", "tsv"],
    ["--json", "--format", "table"],
  ])("rejects invalid input before fetching: %j", async (...args) => {
    const result = await invoke(args);
    expect(result.code).toBe(2);
    expect(result.fetch).not.toHaveBeenCalled();
    expect(result.stdout).toBe("");
  });

  it("reads saved HTML without network access or claiming freshness", async () => {
    const path = join(directory, "saved page.html");
    await writeFile(path, marketplacePage());
    const result = await invoke(["--html", path, "--json"]);
    expect(result.code).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject([{ source: "html" }]);
    expect(result.fetch).not.toHaveBeenCalled();
    expect(result.stderr).toContain("freshness and destination unknown");
  });

  it("reports missing HTML input and rejects non-file or oversized HTML files", async () => {
    const missing = await invoke([
      "--html",
      join(directory, "missing.html"),
      "--json",
    ]);
    expect(missing.code).toBe(2);
    expect(missing.stderr).toContain("GROOVECTL_HTML_INPUT_ERROR");

    const dirInput = await invoke(["--html", directory, "--json"]);
    expect(dirInput.code).toBe(2);
    expect(dirInput.stderr).toContain("GROOVECTL_HTML_INPUT_ERROR");

    const oversized = join(directory, "huge.html");
    await writeFile(oversized, "");
    await truncate(oversized, 10 * 1024 * 1024 + 1);
    const tooBig = await invoke(["--html", oversized, "--json"]);
    expect(tooBig.code).toBe(2);
    expect(tooBig.stderr).toContain("GROOVECTL_HTML_TOO_LARGE");
  });

  it.each([
    [403, 4, "GROOVECTL_MARKETPLACE_WEB_BLOCKED"],
    [429, 6, "GROOVECTL_RATE_LIMITED"],
    [404, 5, "GROOVECTL_NOT_FOUND"],
    [500, 7, "GROOVECTL_MARKETPLACE_WEB_ERROR"],
  ])(
    "reports HTTP %i without retries or response body exposure",
    async (status, expected, expectedCode) => {
      const fetch = vi.fn(() =>
        Promise.resolve(new Response("private-response", { status })),
      );
      const result = await invoke(["--json"], fetch);
      expect(result.code).toBe(expected);
      expect(result.fetch).toHaveBeenCalledTimes(1);
      expect(result.stdout).toBe("");
      expect(result.stderr).toContain(expectedCode);
      expect(result.stderr).not.toContain("private-response");
    },
  );

  it("maps website network errors to exit code 8 without retrying", async () => {
    const fetch = vi.fn(() => Promise.reject(new Error("socket hang up")));
    const result = await invoke(["--json"], fetch);
    expect(result.code).toBe(8);
    expect(result.fetch).toHaveBeenCalledTimes(1);
    expect(result.stderr).toContain("GROOVECTL_NETWORK_ERROR");
  });

  it("rejects a success-status challenge page and non-HTML responses", async () => {
    for (const response of [
      htmlResponse("<h1>Verify you are human</h1>"),
      Response.json({ items: [] }),
    ]) {
      const result = await invoke(
        ["--json"],
        vi.fn(() => Promise.resolve(response)),
      );
      expect(result.code).toBe(7);
      expect(result.stdout).toBe("");
    }
  });

  it("reads every requested page serially, even if all offers on the first page are filtered out", async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(
        htmlResponse(
          marketplacePage([offerRow({ condition: "Very Good (VG)" })], 1, 2),
        ),
      )
      .mockResolvedValueOnce(
        htmlResponse(marketplacePage([offerRow({ id: 43 })], 2, 2)),
      );
    const result = await invoke(
      ["--all", "--per-page", "1", "--min-media", "VG+", "--json"],
      fetch,
    );
    expect(result.code).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject([{ id: 43 }]);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("fails repeated pagination without returning a misleading complete JSON result", async () => {
    const fetch = vi.fn(() =>
      Promise.resolve(htmlResponse(marketplacePage([offerRow()], 1, 2))),
    );
    const result = await invoke(["--all", "--per-page", "1", "--json"], fetch);
    expect(result.code).toBe(7);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("GROOVECTL_PAGINATION_INVALID");
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("fails when a later page repeats an offer ID", async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(
        htmlResponse(marketplacePage([offerRow({ id: 42 })], 1, 2)),
      )
      .mockResolvedValueOnce(
        htmlResponse(marketplacePage([offerRow({ id: 42 })], 2, 2)),
      );
    const result = await invoke(["--all", "--per-page", "1", "--json"], fetch);
    expect(result.code).toBe(7);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("GROOVECTL_PAGINATION_INVALID");
  });

  it("enforces the 100-page ceiling on --all", async () => {
    let pageNumber = 0;
    const fetch = vi.fn<typeof globalThis.fetch>(() => {
      pageNumber += 1;
      return Promise.resolve(
        htmlResponse(
          marketplacePage(
            [offerRow({ id: 1000 + pageNumber })],
            pageNumber,
            101,
          ),
        ),
      );
    });
    const result = await invoke(["--all", "--per-page", "1", "--json"], fetch);
    expect(result.code).toBe(2);
    expect(result.stderr).toContain("GROOVECTL_PAGE_LIMIT");
    expect(fetch).toHaveBeenCalledTimes(100);
  });

  it("stops pagination on access denial and preserves partial JSONL with a nonzero exit", async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(htmlResponse(marketplacePage([offerRow()], 1, 2)))
      .mockResolvedValueOnce(new Response(null, { status: 403 }));
    const result = await invoke(
      ["--all", "--per-page", "1", "--format", "jsonl"],
      fetch,
    );
    expect(result.code).toBe(4);
    expect(JSON.parse(result.stdout)).toMatchObject({ id: 42 });
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});

it("bounds oversized HTML responses from Content-Length and streamed chunks", async () => {
  const byHeader = vi.fn(() =>
    Promise.resolve(
      new Response("", {
        headers: {
          "Content-Type": "text/html",
          "Content-Length": String(11 * 1024 * 1024),
        },
      }),
    ),
  );
  await expect(
    new MarketplaceOffers(byHeader).list(7, { perPage: 50 }).next(),
  ).rejects.toMatchObject({
    code: "GROOVECTL_HTML_TOO_LARGE",
  });

  const chunk = new Uint8Array(1024 * 1024);
  let sent = 0;
  const byStream = vi.fn(() =>
    Promise.resolve(
      new Response(
        new ReadableStream<Uint8Array>({
          pull(controller) {
            if (sent >= 11) {
              controller.close();
              return;
            }
            sent += 1;
            controller.enqueue(chunk);
          },
        }),
        { headers: { "Content-Type": "text/html" } },
      ),
    ),
  );
  await expect(
    new MarketplaceOffers(byStream).list(7, { perPage: 50 }).next(),
  ).rejects.toMatchObject({
    code: "GROOVECTL_HTML_TOO_LARGE",
  });
});
