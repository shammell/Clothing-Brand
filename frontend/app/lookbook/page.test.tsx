import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import LookbookPage from "./page";
import { getCartSnapshot } from "@/lib/shop-store";

class FakeObserver {
  observe() {}
  disconnect() {}
}

const piece = (id: string, name: string, size: string) => ({
  id, name, category: "x", price: 10, rating: 4, image_url: "/x.jpg", colors: ["Black"], sizes: [size], stock: 5,
  variants: [{ size, color: "Black", stock: 5 }],
});

describe("LookbookPage", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.stubGlobal("IntersectionObserver", FakeObserver);
    HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
      this.setAttribute("open", "");
    };
    HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
      this.removeAttribute("open");
    };
  });
  afterEach(() => vi.unstubAllGlobals());

  it("shows a designed empty state when there are no looks", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => [] })));
    render(<LookbookPage />);
    expect(await screen.findByText("New looks are on the way")).toBeTruthy();
  });

  it("adds every chosen piece to the bag as its own line", async () => {
    const look = { product: piece("a", "Linen Shirt", "M"), companions: [piece("b", "Black Jeans", "32"), piece("c", "Sneakers", "9")] };
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => [look] })));
    render(<LookbookPage />);
    await screen.findByText("Complete look");
    fireEvent.click(screen.getByText("Shop this look"));

    // Nothing is added until every piece has a size.
    fireEvent.click(screen.getByText(/Add all to bag/));
    expect(getCartSnapshot()).toHaveLength(0);
    expect(screen.getAllByText("Select a size").length).toBe(3);

    fireEvent.click(screen.getByRole("radio", { name: "M" }));
    fireEvent.click(screen.getByRole("radio", { name: "32" }));
    fireEvent.click(screen.getByRole("radio", { name: "9" }));
    fireEvent.click(screen.getByText(/Add all to bag/));
    expect(getCartSnapshot().map((line) => [line.id, line.size])).toEqual([["a", "M"], ["b", "32"], ["c", "9"]]);
  });
});
