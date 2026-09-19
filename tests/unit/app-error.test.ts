import { describe, expect, it } from "vitest";

import {
  AppError,
  asAppError,
  exitCodeForError,
} from "../../src/errors/app-error.js";

describe("exitCodeForError", () => {
  it.each([
    ["usage", 2],
    ["auth_required", 3],
    ["forbidden", 4],
    ["not_found", 5],
    ["rate_limited", 6],
    ["upstream", 7],
    ["network", 8],
    ["cancelled", 10],
  ] as const)("maps %s to %i", (kind, expected) => {
    const error = new AppError({ kind, code: "TEST", message: "test" });
    expect(exitCodeForError(error)).toBe(expected);
  });

  it("preserves known errors and sanitizes unknown errors", () => {
    const known = new AppError({
      kind: "network",
      code: "KNOWN",
      message: "known",
    });
    expect(asAppError(known)).toBe(known);
    expect(asAppError(new Error("secret detail"))).toMatchObject({
      code: "CRATEFLOW_UNEXPECTED",
      message: "An unexpected error occurred.",
    });
  });
});
