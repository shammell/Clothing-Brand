import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";

vi.mock("next/navigation", () => ({ usePathname: () => "/shop", useRouter: () => ({ push: vi.fn() }) }));

import { CartDrawer } from "./CartDrawer";
import { getCartSnapshot, writeCart, type CartLine } from "@/lib/shop-store";
import { closeCartDrawer, openCartDrawer } from "@/lib/ui-store";

function line(overrides: Partial<CartLine> = {}): CartLine {
  return {
    id: "p1", name: "Tee", category: "T", price: 10, rating: 4, image: "/x",
    colors: ["Black"], sizes: ["S"], size: "S", color: "Black", quantity: 1, stock: 5,
    ...overrides,
  };
}

describe("CartDrawer", () => {
  beforeEach(() => {
    localStorage.clear();
    // jsdom does not implement the modal dialog API; model open/close only.
    HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
      this.setAttribute("open", "");
    };
    HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
      this.removeAttribute("open");
      this.dispatchEvent(new Event("close"));
    };
  });

  afterEach(() => act(() => closeCartDrawer()));

  it("opens through the store and renders the bag lines", () => {
    writeCart([line({ quantity: 2 })]);
    const { container } = render(<CartDrawer />);
    expect(container.querySelector("dialog")?.hasAttribute("open")).toBe(false);
    act(() => openCartDrawer());
    expect(container.querySelector("dialog")?.hasAttribute("open")).toBe(true);
    expect(screen.getByText("Tee")).toBeTruthy();
    expect(screen.getByText("$20.00", { selector: "strong" })).toBeTruthy();
  });

  it("changes quantity and removes lines through the shared bag logic", () => {
    writeCart([line({ quantity: 1 })]);
    render(<CartDrawer />);
    act(() => openCartDrawer());
    fireEvent.click(screen.getByLabelText("Increase quantity for Tee"));
    expect(getCartSnapshot()[0].quantity).toBe(2);
    fireEvent.click(screen.getByLabelText("Remove Tee from bag"));
    expect(getCartSnapshot()).toHaveLength(0);
    expect(screen.getByText("Your bag is waiting")).toBeTruthy();
  });

  it("closes from the close button and from a scrim click", () => {
    writeCart([line()]);
    const { container } = render(<CartDrawer />);
    const dialog = container.querySelector("dialog")!;
    act(() => openCartDrawer());
    fireEvent.click(screen.getByLabelText("Close bag"));
    expect(dialog.hasAttribute("open")).toBe(false);
    act(() => openCartDrawer());
    fireEvent.click(dialog);
    expect(dialog.hasAttribute("open")).toBe(false);
  });
});
