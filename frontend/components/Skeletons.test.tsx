import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { OrderSkeleton, ProductDetailSkeleton, ProductGridSkeleton } from "./Skeletons";

describe("Skeletons", () => {
  it("renders the requested number of card placeholders with an accessible status", () => {
    const { container } = render(<ProductGridSkeleton count={4} />);
    expect(container.querySelectorAll(".product-card")).toHaveLength(4);
    expect(screen.getByRole("status").textContent).toContain("Loading");
  });

  it("renders detail and order placeholders", () => {
    const { container, unmount } = render(<ProductDetailSkeleton />);
    expect(container.querySelector(".product-detail")).not.toBeNull();
    unmount();
    const order = render(<OrderSkeleton />);
    expect(order.container.querySelector(".order-card")).not.toBeNull();
  });
});
