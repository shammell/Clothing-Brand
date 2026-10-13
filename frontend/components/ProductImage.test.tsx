import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { ProductImage } from "./ProductImage";

describe("ProductImage", () => {
  it("fades in once loaded", () => {
    render(<ProductImage src="/a.jpg" alt="Tee" />);
    const img = screen.getByAltText("Tee");
    expect(img.className).not.toContain("loaded");
    fireEvent.load(img);
    expect(img.className).toContain("loaded");
  });

  it("falls back to the placeholder when the URL is broken", () => {
    render(<ProductImage src="/broken.jpg" alt="Tee" />);
    const img = screen.getByAltText("Tee");
    fireEvent.error(img);
    expect(img.getAttribute("src")).toBe("/products/no-image.svg");
  });

  it("lazy loads unless prioritised", () => {
    const { rerender } = render(<ProductImage src="/a.jpg" alt="Tee" />);
    expect(screen.getByAltText("Tee").getAttribute("loading")).toBe("lazy");
    rerender(<ProductImage src="/a.jpg" alt="Tee" priority />);
    expect(screen.getByAltText("Tee").getAttribute("loading")).toBe("eager");
  });
});
