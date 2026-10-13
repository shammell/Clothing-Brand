import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { CompleteTheLook, PairsWellWith, excludeInBag } from "./CompleteTheLook";
import { getCartSnapshot, type CartLine, type Product } from "@/lib/shop-store";

const jeans = { id: "j1", name: "Black Jeans", category: "Jeans", price: 40, image_url: "/j.jpg", rating: 4, colors: ["Black"], sizes: ["30", "32"], stock: 6, variants: [{ size: "30", color: "Black", stock: 0 }, { size: "32", color: "Black", stock: 6 }] };
const shoes = { id: "s1", name: "White Sneakers", category: "Shoes", price: 60, image_url: "/s.jpg", rating: 4, colors: ["White"], sizes: ["9"], stock: 3 };

function stubCompanions(items: unknown[]) {
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => items })));
}

const line = (id: string): CartLine => ({ id, name: id, category: "x", price: 1, rating: 1, image: "/x", colors: [], sizes: [], size: "S", color: "Black", quantity: 1 });

describe("CompleteTheLook", () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => vi.unstubAllGlobals());

  it("renders nothing when there are no companions", async () => {
    stubCompanions([]);
    const { container } = render(<CompleteTheLook productId="p1" />);
    await waitFor(() => expect(container.querySelector("[aria-hidden='true']")).toBeNull());
    expect(container.innerHTML).toBe("");
  });

  it("requires a size and respects variant stock when adding", async () => {
    stubCompanions([jeans]);
    render(<CompleteTheLook productId="p1" />);
    await screen.findByText("Complete the look");
    fireEvent.click(screen.getByText("Add"));
    expect(screen.getByText("Select a size")).toBeTruthy();
    expect(getCartSnapshot()).toHaveLength(0);

    fireEvent.click(screen.getByRole("radio", { name: "30, sold out" }));
    expect(getCartSnapshot()).toHaveLength(0);

    fireEvent.click(screen.getByRole("radio", { name: "32" }));
    fireEvent.click(screen.getByText("Add"));
    expect(getCartSnapshot().map((l) => [l.id, l.size])).toEqual([["j1", "32"]]);
  });
});

describe("drawer suggestion", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("excludes products already in the bag", () => {
    const companions = [jeans, shoes].map((p) => ({ ...p, image: p.image_url })) as unknown as Product[];
    expect(excludeInBag(companions, [line("j1")]).map((p) => p.id)).toEqual(["s1"]);
  });

  it("suggests one pairing for the latest line and nothing when all are in the bag", async () => {
    stubCompanions([jeans, shoes]);
    const { rerender, container } = render(<PairsWellWith cart={[line("p1")]} />);
    expect(await screen.findByText("Black Jeans")).toBeTruthy();
    rerender(<PairsWellWith cart={[line("p1"), line("j1")]} />);
    await waitFor(() => expect(screen.queryByText("Black Jeans")).toBeNull());
    expect(container.textContent).toContain("White Sneakers");
    rerender(<PairsWellWith cart={[line("p1"), line("j1"), line("s1")]} />);
    await waitFor(() => expect(container.innerHTML).toBe(""));
  });
});
