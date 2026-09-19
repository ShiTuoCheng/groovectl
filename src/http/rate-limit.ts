import type { RateLimitState } from "./request.js";

export interface RateLimitGateOptions {
  now?: () => number;
  sleep?: (milliseconds: number) => Promise<void>;
}

export class RateLimitGate {
  readonly #now: () => number;
  readonly #sleep: (milliseconds: number) => Promise<void>;
  #nextAllowedAt = 0;

  constructor(options: RateLimitGateOptions = {}) {
    this.#now = options.now ?? Date.now;
    this.#sleep = options.sleep ?? defaultSleep;
  }

  update(state: RateLimitState): void {
    if (
      state.limit === null ||
      state.limit <= 0 ||
      state.remaining === null ||
      state.remaining > 1
    ) {
      return;
    }
    this.#nextAllowedAt = Math.max(
      this.#nextAllowedAt,
      this.#now() + Math.ceil(60_000 / state.limit),
    );
  }

  async wait(): Promise<void> {
    const delay = this.#nextAllowedAt - this.#now();
    if (delay > 0) await this.#sleep(delay);
  }
}

async function defaultSleep(milliseconds: number): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
}
