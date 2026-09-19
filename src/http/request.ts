import { AppError } from "../errors/app-error.js";

export type FetchLike = typeof fetch;

export interface RequestOptions {
  fetch?: FetchLike;
  timeoutMs?: number;
}

export async function requestJson(
  url: URL,
  init: RequestInit,
  options: RequestOptions = {},
): Promise<unknown> {
  const fetchImpl = options.fetch ?? fetch;
  const timeoutMs = options.timeoutMs ?? 30_000;

  try {
    const response = await fetchImpl(url, {
      ...init,
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (!response.ok) {
      throw errorForStatus(response.status);
    }

    try {
      return await response.json();
    } catch (cause: unknown) {
      throw new AppError({
        kind: "upstream",
        code: "CRATEFLOW_INVALID_RESPONSE",
        message: "Discogs returned an invalid JSON response.",
        httpStatus: response.status,
        cause,
      });
    }
  } catch (error: unknown) {
    if (error instanceof AppError) {
      throw error;
    }
    throw new AppError({
      kind: "network",
      code: "CRATEFLOW_NETWORK_ERROR",
      message: "The request to Discogs failed.",
      remediation: "Check your network connection and try again.",
      cause: error,
    });
  }
}

function errorForStatus(status: number): AppError {
  if (status === 401) {
    return new AppError({
      kind: "auth_invalid",
      code: "CRATEFLOW_AUTH_INVALID",
      message: "Discogs rejected the supplied token.",
      httpStatus: status,
    });
  }
  if (status === 403) {
    return new AppError({
      kind: "forbidden",
      code: "CRATEFLOW_FORBIDDEN",
      message: "Discogs denied access to this resource.",
      httpStatus: status,
    });
  }
  if (status === 404) {
    return new AppError({
      kind: "not_found",
      code: "CRATEFLOW_NOT_FOUND",
      message: "The requested Discogs resource was not found.",
      httpStatus: status,
    });
  }
  if (status === 429) {
    return new AppError({
      kind: "rate_limited",
      code: "CRATEFLOW_RATE_LIMITED",
      message: "Discogs rate limit exceeded.",
      remediation: "Wait before retrying the request.",
      httpStatus: status,
    });
  }
  return new AppError({
    kind: "upstream",
    code: "CRATEFLOW_DISCOGS_ERROR",
    message: `Discogs returned HTTP ${String(status)}.`,
    httpStatus: status,
  });
}
