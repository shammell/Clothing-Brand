import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

const pathnameMock = vi.hoisted(() => ({ value: "/" }));
vi.mock("next/navigation", () => ({ usePathname: () => pathnameMock.value }));

import { SiteHeader } from "./SiteHeader";

describe("SiteHeader", () => {
  beforeEach(() => {
    localStorage.clear();
    pathnameMock.value = "/shop";
  });

  it("renders nothing inside the admin and lister shells", () => {
    for (const path of ["/admin", "/admin/anything", "/lister"]) {
      pathnameMock.value = path;
      const { container, unmount } = render(<SiteHeader />);
      expect(container.innerHTML).toBe("");
      unmount();
    }
  });

  it("shows the bag count from the saved bag", () => {
    localStorage.setItem(
      "threadco_cart",
      JSON.stringify([
        { id: "p1", name: "Tee", category: "T", price: 1, rating: 1, image: "/x", colors: [], sizes: [], size: "S", color: "Black", quantity: 2 },
        { id: "p2", name: "Hat", category: "T", price: 1, rating: 1, image: "/x", colors: [], sizes: [], size: "S", color: "Black", quantity: 3 },
      ]),
    );
    render(<SiteHeader />);
    expect(screen.getByLabelText("Open cart").textContent).toContain("5");
  });

  it("shows the announcement bar only on the homepage", () => {
    pathnameMock.value = "/";
    const { unmount } = render(<SiteHeader />);
    expect(screen.queryByText(/Free shipping/)).not.toBeNull();
    unmount();
    pathnameMock.value = "/shop";
    render(<SiteHeader />);
    expect(screen.queryByText(/Free shipping/)).toBeNull();
  });
});

describe("SiteHeader announcements", () => {
  it("announces an add once in a polite live region", async () => {
    const { act } = await import("@testing-library/react");
    const { announce, addedAnnouncement } = await import("@/lib/ui-store");
    pathnameMock.value = "/shop";
    render(<SiteHeader />);
    act(() => announce(addedAnnouncement("Tee", "M", 3)));
    const region = screen.getByRole("status");
    expect(region.getAttribute("aria-live")).toBe("polite");
    expect(region.textContent).toBe("Added Tee, size M. Bag has 3 items.");
    expect(addedAnnouncement("Tee", "M", 1)).toBe("Added Tee, size M. Bag has 1 item.");
  });
});

describe("SiteHeader mobile menu", () => {
  it("toggles the link menu and closes it on Escape", () => {
    pathnameMock.value = "/shop";
    render(<SiteHeader />);
    const toggle = screen.getByLabelText("Open menu");
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(toggle);
    expect(screen.getByLabelText("Close menu").getAttribute("aria-expanded")).toBe("true");
    expect(document.getElementById("site-menu")?.className).toContain("open");
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.getByLabelText("Open menu").getAttribute("aria-expanded")).toBe("false");
  });
});
