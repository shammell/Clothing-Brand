import { describe, expect, it } from "vitest";
import { safeNextPath } from "./safeNextPath";

describe("safeNextPath", () => {
  it("accepts a plain same-origin path", () => {
    expect(safeNextPath("/cart")).toBe("/cart");
  });

  it("falls back to /account for null", () => {
    expect(safeNextPath(null)).toBe("/account");
  });

  it("rejects a protocol-relative path", () => {
    expect(safeNextPath("//evil.com")).toBe("/account");
  });

  it("rejects an absolute external URL", () => {
    expect(safeNextPath("https://evil.com")).toBe("/account");
  });

  it("strips tabs/CR/LF before validating, matching browser URL resolution", () => {
    expect(safeNextPath("/\t/evil.com")).toBe("/account");
  });
});
