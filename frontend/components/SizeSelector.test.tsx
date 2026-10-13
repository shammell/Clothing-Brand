import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { SizeSelector } from "./SizeSelector";
import type { Product } from "@/lib/shop-store";

const product: Product = {
  id: "p1", name: "Tee", category: "T", price: 10, rating: 4, image: "/x",
  sizes: ["S", "M", "L"], colors: ["Black", "Navy"],
  variants: [
    { size: "S", color: "Black", stock: 9 },
    { size: "M", color: "Black", stock: 0 },
    { size: "L", color: "Black", stock: 2 },
    { size: "S", color: "Navy", stock: 9 },
    { size: "M", color: "Navy", stock: 6 },
    { size: "L", color: "Navy", stock: 0 },
  ],
};

describe("SizeSelector", () => {
  it("marks a size sold out for the selected colour only", () => {
    const { rerender } = render(<SizeSelector product={product} color="Black" value="" onSelect={() => {}} />);
    expect(screen.getByRole("radio", { name: "M, sold out" }).getAttribute("aria-disabled")).toBe("true");
    rerender(<SizeSelector product={product} color="Navy" value="" onSelect={() => {}} />);
    expect(screen.getByRole("radio", { name: "M" }).getAttribute("aria-disabled")).toBeNull();
  });

  it("does not select a sold-out size and explains where it is available", () => {
    const onSelect = vi.fn();
    render(<SizeSelector product={product} color="Black" value="" onSelect={onSelect} />);
    fireEvent.click(screen.getByRole("radio", { name: "M, sold out" }));
    expect(onSelect).not.toHaveBeenCalled();
    expect(screen.getByRole("status").textContent).toContain("Size M is available in Navy");
  });

  it("selects an available size and shows the low-stock caption", () => {
    const onSelect = vi.fn();
    const { rerender } = render(<SizeSelector product={product} color="Black" value="" onSelect={onSelect} />);
    fireEvent.click(screen.getByRole("radio", { name: "S" }));
    expect(onSelect).toHaveBeenCalledWith("S");
    rerender(<SizeSelector product={product} color="Black" value="L" onSelect={onSelect} />);
    expect(screen.getByText("Only 2 left")).toBeTruthy();
  });

  it("moves focus with arrow keys using a roving tab stop", () => {
    render(<SizeSelector product={product} color="Navy" value="" onSelect={() => {}} />);
    const first = screen.getByRole("radio", { name: "S" });
    first.focus();
    fireEvent.keyDown(first, { key: "ArrowRight" });
    expect(document.activeElement).toBe(screen.getByRole("radio", { name: "M" }));
    expect(screen.getByRole("radio", { name: "M" }).getAttribute("tabindex")).toBe("0");
    expect(first.getAttribute("tabindex")).toBe("-1");
  });

  it("treats products without variants as fully available", () => {
    const legacy: Product = { ...product, variants: undefined };
    render(<SizeSelector product={legacy} color="Black" value="" onSelect={() => {}} />);
    expect(screen.getAllByRole("radio").every((radio) => radio.getAttribute("aria-disabled") === null)).toBe(true);
  });
});
