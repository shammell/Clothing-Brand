import { describe, expect, it } from "vitest";
import { assertCanUploadImages } from "./uploadAuth";

describe("assertCanUploadImages", () => {
  it("allows admin and lister", () => {
    expect(() => assertCanUploadImages("admin")).not.toThrow();
    expect(() => assertCanUploadImages("lister")).not.toThrow();
  });

  it("rejects customer and undefined", () => {
    expect(() => assertCanUploadImages("customer")).toThrow();
    expect(() => assertCanUploadImages(undefined)).toThrow();
  });
});
