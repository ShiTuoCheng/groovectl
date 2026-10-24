import { describe, expect, it, vi } from "vitest";

import { requestJson, type RateLimitState } from "../../src/http/request.js";

describe("requestJson", () => {
  it("retries retryable upstream failures with exponential backoff", async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValueOnce(new Response(null, { status: 502 }))
      .mockResolvedValueOnce(Response.json({ ok: true }));
    const sleep = vi.fn<(milliseconds: number) => Promise<void>>(() =>
      Promise.resolve(),
    );

    await expect(
      requestJson(
        new URL("https://api.discogs.com/test"),
        { method: "GET" },
        {
          fetch,
          maxRetries: 3,
          random: () => 0,
          sleep,
        },
      ),
    ).resolves.toEqual({ ok: true });
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(sleep.mock.calls).toEqual([[250], [500]]);
  });

  it("honors Retry-After for a rate-limited response", async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(
        new Response(null, { status: 429, headers: { "retry-after": "2" } }),
      )
      .mockResolvedValueOnce(Response.json({ ok: true }));
    const sleep = vi.fn<(milliseconds: number) => Promise<void>>(() =>
      Promise.resolve(),
    );

    await requestJson(
      new URL("https://api.discogs.com/test"),
      { method: "GET" },
      { fetch, maxRateLimitWaitMs: 2_000, sleep },
    );
    expect(sleep).toHaveBeenCalledWith(2_000);
  });

  it("reports Discogs rate-limit headers", async () => {
    let state: RateLimitState | undefined;
    await requestJson(
      new URL("https://api.discogs.com/test"),
      { method: "GET" },
      {
        fetch: () =>
          Promise.resolve(
            Response.json(
              { ok: true },
              {
                headers: {
                  "x-discogs-ratelimit": "60",
                  "x-discogs-ratelimit-remaining": "58",
                  "x-discogs-ratelimit-used": "2",
                },
              },
            ),
          ),
        onRateLimit: (value) => {
          state = value;
        },
      },
    );
    expect(state).toEqual({ limit: 60, remaining: 58, used: 2 });
  });

  it("does not retry non-GET requests", async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValue(new Response(null, { status: 503 }));
    await expect(
      requestJson(
        new URL("https://api.discogs.com/test"),
        { method: "POST" },
        { fetch, sleep: () => Promise.resolve() },
      ),
    ).rejects.toMatchObject({ code: "GROOVECTL_DISCOGS_ERROR" });
    expect(fetch).toHaveBeenCalledOnce();
  });

  it("maps an aborted slow response to a network error", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () =>
            reject(new Error("aborted")),
          );
        }),
    );
    await expect(
      requestJson(
        new URL("https://api.discogs.com/slow"),
        { method: "GET" },
        { fetch, timeoutMs: 1, maxRetries: 0 },
      ),
    ).rejects.toMatchObject({ code: "GROOVECTL_NETWORK_ERROR" });
  });
});
