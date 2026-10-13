import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { VariantStockGrid } from "./VariantStockGrid";
import { variantKey } from "@/lib/variantGrid";

describe("VariantStockGrid", () => {
  it("renders a labelled input per combination and reports changes", () => {
    const onChange = vi.fn();
    render(<VariantStockGrid sizes={["S", "M"]} colors={["Black"]} values={{ [variantKey("M", "Black")]: "7" }} onChange={onChange} inputClass="" />);
    const input = screen.getByLabelText("Stock for M in Black") as HTMLInputElement;
    expect(input.value).toBe("7");
    expect((screen.getByLabelText("Stock for S in Black") as HTMLInputElement).value).toBe("0");
    fireEvent.change(input, { target: { value: "3" } });
    expect(onChange).toHaveBeenCalledWith(variantKey("M", "Black"), "3");
  });

  it("shows a hint when sizes or colors are missing", () => {
    render(<VariantStockGrid sizes={[]} colors={["Black"]} values={{}} onChange={() => {}} inputClass="" />);
    expect(screen.getByText(/Add sizes and colors/)).toBeTruthy();
  });
});
