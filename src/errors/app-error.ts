export type ErrorKind =
  | "usage"
  | "auth_required"
  | "auth_invalid"
  | "forbidden"
  | "not_found"
  | "rate_limited"
  | "validation"
  | "upstream"
  | "network"
  | "cancelled";

export interface AppErrorOptions {
  kind: ErrorKind;
  code: string;
  message: string;
  remediation?: string;
  httpStatus?: number;
  cause?: unknown;
}

export class AppError extends Error {
  readonly kind: ErrorKind;
  readonly code: string;
  readonly remediation: string | undefined;
  readonly httpStatus: number | undefined;

  constructor(options: AppErrorOptions) {
    super(options.message, { cause: options.cause });
    this.name = "AppError";
    this.kind = options.kind;
    this.code = options.code;
    this.remediation = options.remediation;
    this.httpStatus = options.httpStatus;
  }
}

export function asAppError(error: unknown): AppError {
  if (error instanceof AppError) {
    return error;
  }
  return new AppError({
    kind: "upstream",
    code: "CRATEFLOW_UNEXPECTED",
    message: "An unexpected error occurred.",
    cause: error,
  });
}

export function exitCodeForError(error: AppError): number {
  switch (error.kind) {
    case "usage":
    case "validation":
      return 2;
    case "auth_required":
    case "auth_invalid":
      return 3;
    case "forbidden":
      return 4;
    case "not_found":
      return 5;
    case "rate_limited":
      return 6;
    case "upstream":
      return 7;
    case "network":
      return 8;
    case "cancelled":
      return 10;
  }
}
