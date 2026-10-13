import { describe, expect, it } from "vitest";
import { fitWithin } from "./downscaleImage";

describe("fitWithin", () => {
  it("scales the longest edge down to 768", () => {
    expect(fitWithin(4000, 3000)).toEqual({ width: 768, height: 576 });
    expect(fitWithin(3000, 4000)).toEqual({ width: 576, height: 768 });
  });

  it("never enlarges small images", () => {
    expect(fitWithin(400, 300)).toEqual({ width: 400, height: 300 });
  });
});
