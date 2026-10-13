import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { ColorSelector } from "./ColorSelector";
import type { Product } from "@/lib/shop-store";

const product: Product = {
  id: "p1", name: "Tee", category: "T", price: 10, rating: 4, image: "/x",
  sizes: ["S"], colors: ["Black", "White"],
  variants: [
    { size: "S", color: "Black", stock: 0 },
    { size: "S", color: "White", stock: 3 },
  ],
};

describe("ColorSelector", () => {
  it("flags colours with no stock and shows the selected name", () => {
    render(<ColorSelector product={product} value="White" onSelect={() => {}} variant="full" />);
    expect(screen.getByRole("radio", { name: "Black, sold out" }).className).toContain("sold-out");
    expect(screen.getByRole("radio", { name: "White" }).getAttribute("aria-checked")).toBe("true");
    expect(screen.getByText("White", { selector: ".swatch-name" })).toBeTruthy();
  });

  it("reports the chosen colour", () => {
    const onSelect = vi.fn();
    render(<ColorSelector product={product} value="White" onSelect={onSelect} />);
    fireEvent.click(screen.getByRole("radio", { name: "Black, sold out" }));
    expect(onSelect).toHaveBeenCalledWith("Black");
  });
});
