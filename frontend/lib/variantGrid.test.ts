import { describe, expect, it } from "vitest";
import { gridToVariants, parseList, variantKey, variantTotals, variantsToValues } from "./variantGrid";

describe("variantGrid", () => {
  it("parses and dedupes comma lists", () => {
    expect(parseList(" S, M ,S,, L")).toEqual(["S", "M", "L"]);
  });

  it("keeps entered values when a size and a color are added", () => {
    const values = variantsToValues([{ size: "S", color: "Black", stock: 5 }]);
    const variants = gridToVariants(["S", "M"], ["Black", "White"], values);
    expect(variants).toEqual([
      { size: "S", color: "Black", stock: 5 },
      { size: "S", color: "White", stock: 0 },
      { size: "M", color: "Black", stock: 0 },
      { size: "M", color: "White", stock: 0 },
    ]);
  });

  it("drops values for removed sizes and clamps bad input to 0", () => {
    const values = { [variantKey("S", "Black")]: "-3", [variantKey("XL", "Black")]: "9" };
    expect(gridToVariants(["S"], ["Black"], values)).toEqual([{ size: "S", color: "Black", stock: 0 }]);
  });

  it("totals stock and counts sold out variants", () => {
    expect(variantTotals([{ size: "S", color: "A", stock: 0 }, { size: "M", color: "A", stock: 4 }])).toEqual({ total: 4, soldOut: 1 });
  });
});
