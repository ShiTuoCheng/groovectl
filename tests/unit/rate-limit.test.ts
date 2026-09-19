import { describe, expect, it, vi } from "vitest";

import { RateLimitGate } from "../../src/http/rate-limit.js";

describe("RateLimitGate", () => {
  it("paces the next request when the remaining budget is nearly empty", async () => {
    let now = 1_000;
    const sleep = vi.fn((milliseconds: number) => {
      now += milliseconds;
      return Promise.resolve();
    });
    const gate = new RateLimitGate({ now: () => now, sleep });
    gate.update({ limit: 60, remaining: 1, used: 59 });
    await gate.wait();
    expect(sleep).toHaveBeenCalledWith(1_000);
  });
});
