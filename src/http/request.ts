import { AppError } from "../errors/app-error.js";

export type FetchLike = typeof fetch;

export interface RequestOptions {
  beforeRequest?: () => Promise<void>;
  fetch?: FetchLike;
  maxRateLimitWaitMs?: number;
  maxRetries?: number;
  onRateLimit?: (state: RateLimitState) => void;
  onDiagnostic?: (message: string) => void;
  random?: () => number;
  sleep?: (milliseconds: number) => Promise<void>;
  timeoutMs?: number;
}

export interface RateLimitState {
  limit: number | null;
  remaining: number | null;
  used: number | null;
}

export async function requestJson(
  url: URL,
  init: RequestInit,
  options: RequestOptions = {},
): Promise<unknown> {
  const fetchImpl = options.fetch ?? fetch;
  const timeoutMs = options.timeoutMs ?? 30_000;
  const maxRetries = options.maxRetries ?? 3;
  const maxRateLimitWaitMs = options.maxRateLimitWaitMs ?? 60_000;
  const sleep = options.sleep ?? defaultSleep;
  const random = options.random ?? Math.random;
  const retryableMethod = (init.method ?? "GET").toUpperCase() === "GET";

  for (let attempt = 0; ; attempt += 1) {
    try {
      await options.beforeRequest?.();
      const startedAt = Date.now();
      options.onDiagnostic?.(
        `${(init.method ?? "GET").toUpperCase()} ${url.origin}${url.pathname}`,
      );
      const response = await fetchImpl(url, {
        ...init,
        signal: AbortSignal.timeout(timeoutMs),
      });
      options.onRateLimit?.(rateLimitState(response.headers));
      options.onDiagnostic?.(
        `HTTP ${String(response.status)} in ${String(Date.now() - startedAt)}ms`,
      );

      if (!response.ok) {
        const retryDelay = delayForResponse(
          response,
          attempt,
          retryableMethod ? maxRetries : 0,
          maxRateLimitWaitMs,
          random,
        );
        if (retryDelay !== undefined) {
          await sleep(retryDelay);
          continue;
        }
        throw errorForStatus(response.status);
      }

      try {
        if (response.status === 204) return undefined;
        const text = await response.text();
        if (text.length === 0) return undefined;
        return JSON.parse(text) as unknown;
      } catch (cause: unknown) {
        throw new AppError({
          kind: "upstream",
          code: "GROOVECTL_INVALID_RESPONSE",
          message: "Discogs returned an invalid JSON response.",
          httpStatus: response.status,
          cause,
        });
      }
    } catch (error: unknown) {
      if (error instanceof AppError) throw error;
      if (retryableMethod && attempt < maxRetries) {
        await sleep(backoffDelay(attempt, random));
        continue;
      }
      throw new AppError({
        kind: "network",
        code: "GROOVECTL_NETWORK_ERROR",
        message: "The request to Discogs failed.",
        remediation: "Check your network connection and try again.",
        cause: error,
      });
    }
  }
}

function delayForResponse(
  response: Response,
  attempt: number,
  maxRetries: number,
  maxRateLimitWaitMs: number,
  random: () => number,
): number | undefined {
  if (attempt >= maxRetries) return undefined;
  if ([502, 503, 504].includes(response.status)) {
    return backoffDelay(attempt, random);
  }
  if (response.status !== 429) return undefined;
  const retryAfter = parseRetryAfter(response.headers.get("retry-after"));
  return retryAfter !== undefined && retryAfter <= maxRateLimitWaitMs
    ? retryAfter
    : undefined;
}

function parseRetryAfter(value: string | null): number | undefined {
  if (value === null) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1_000;
  const date = Date.parse(value);
  if (Number.isNaN(date)) return undefined;
  return Math.max(0, date - Date.now());
}

function backoffDelay(attempt: number, random: () => number): number {
  return 250 * 2 ** attempt + Math.floor(random() * 100);
}

function rateLimitState(headers: Headers): RateLimitState {
  return {
    limit: integerHeader(headers, "x-discogs-ratelimit"),
    remaining: integerHeader(headers, "x-discogs-ratelimit-remaining"),
    used: integerHeader(headers, "x-discogs-ratelimit-used"),
  };
}

function integerHeader(headers: Headers, name: string): number | null {
  const value = headers.get(name);
  if (value === null) return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

async function defaultSleep(milliseconds: number): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
}

function errorForStatus(status: number): AppError {
  if (status === 401) {
    return new AppError({
      kind: "auth_invalid",
      code: "GROOVECTL_AUTH_INVALID",
      message: "Discogs rejected the supplied token.",
      httpStatus: status,
    });
  }
  if (status === 403) {
    return new AppError({
      kind: "forbidden",
      code: "GROOVECTL_FORBIDDEN",
      message: "Discogs denied access to this resource.",
      httpStatus: status,
    });
  }
  if (status === 404) {
    return new AppError({
      kind: "not_found",
      code: "GROOVECTL_NOT_FOUND",
      message: "The requested Discogs resource was not found.",
      httpStatus: status,
    });
  }
  if (status === 429) {
    return new AppError({
      kind: "rate_limited",
      code: "GROOVECTL_RATE_LIMITED",
      message: "Discogs rate limit exceeded.",
      remediation: "Wait before retrying the request.",
      httpStatus: status,
    });
  }
  if (status === 405) {
    return new AppError({
      kind: "usage",
      code: "GROOVECTL_METHOD_NOT_ALLOWED",
      message: "Discogs does not allow this operation for the resource.",
      httpStatus: status,
    });
  }
  if (status === 422) {
    return new AppError({
      kind: "validation",
      code: "GROOVECTL_VALIDATION_FAILED",
      message: "Discogs rejected the supplied values.",
      httpStatus: status,
    });
  }
  return new AppError({
    kind: "upstream",
    code: "GROOVECTL_DISCOGS_ERROR",
    message: `Discogs returned HTTP ${String(status)}.`,
    httpStatus: status,
  });
}
