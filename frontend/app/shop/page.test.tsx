import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import ShopPage from "./page";

const api = [
  { id: "1", name: "Linen Shirt", category: "Shirts", price: 10, rating: 4, image_url: "/a.jpg", colors: ["Cream"], sizes: ["S"], stock: 5 },
  { id: "2", name: "Zip Hoodie", category: "Hoodies", price: 20, rating: 4, image_url: "/b.jpg", colors: ["Grey"], sizes: ["M"], stock: 5 },
];

describe("ShopPage", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => api }));
  });
  afterEach(() => vi.unstubAllGlobals());

  it("shows an empty state with Clear filters when nothing matches, and restores the grid", async () => {
    render(<ShopPage />);
    await waitFor(() => expect(screen.getByText("Linen Shirt")).toBeTruthy());
    fireEvent.change(screen.getByPlaceholderText("Search products..."), { target: { value: "zzz" } });
    await waitFor(() => expect(screen.getByText("No styles match")).toBeTruthy());
    fireEvent.click(screen.getByText("Clear filters"));
    await waitFor(() => expect(screen.getByText("Linen Shirt")).toBeTruthy());
  });
});
