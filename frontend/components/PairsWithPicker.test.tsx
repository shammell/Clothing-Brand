import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { PairsWithPicker } from "./PairsWithPicker";

const options = [
  { id: "1", name: "Black Jeans" },
  { id: "2", name: "White Sneakers" },
  { id: "3", name: "Zip Hoodie" },
  { id: "4", name: "Linen Shirt" },
  { id: "5", name: "Summer Dress" },
];

describe("PairsWithPicker", () => {
  it("searches, excludes the product being edited, and adds a pairing", () => {
    const onChange = vi.fn();
    render(<PairsWithPicker options={options} selected={[]} excludeId="3" onChange={onChange} inputClass="" />);
    expect(screen.queryByLabelText("Zip Hoodie")).toBeNull();
    fireEvent.change(screen.getByLabelText("Search products to pair"), { target: { value: "jean" } });
    expect(screen.queryByText("White Sneakers")).toBeNull();
    fireEvent.click(screen.getByLabelText("Black Jeans"));
    expect(onChange).toHaveBeenCalledWith(["1"]);
  });

  it("caps at four and allows removal", () => {
    const onChange = vi.fn();
    render(<PairsWithPicker options={options} selected={["1", "2", "3", "4"]} excludeId={null} onChange={onChange} inputClass="" />);
    expect((screen.getByLabelText("Summer Dress") as HTMLInputElement).disabled).toBe(true);
    fireEvent.click(screen.getByLabelText("Remove Black Jeans from pairings"));
    expect(onChange).toHaveBeenCalledWith(["2", "3", "4"]);
  });
});
