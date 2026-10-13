import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

vi.mock("@/lib/downscaleImage", () => ({
  downscaleImage: vi.fn(async () => new Blob(["small"], { type: "image/jpeg" })),
  fitWithin: vi.fn(),
}));

import { VisualSearch, describeMatch, type VisualState } from "./VisualSearch";
import ShopPage from "@/app/shop/page";
import { fitWithin as realFit } from "@/lib/downscaleImage";

const photo = () => new File(["x"], "look.jpg", { type: "image/jpeg" });

function pick(file: File) {
  fireEvent.change(screen.getByLabelText("Choose a photo"), { target: { files: [file] } });
}

describe("VisualSearch", () => {
  beforeEach(() => {
    URL.createObjectURL = vi.fn(() => "blob:thumb");
  });
  afterEach(() => vi.unstubAllGlobals());

  it("has an accessible camera button", () => {
    render(<VisualSearch onChange={() => {}} />);
    expect(screen.getByRole("button", { name: "Search by photo" })).toBeTruthy();
  });

  it("reports loading then results, uploading the downscaled image", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ attributes: { category: "Hoodies", colors: ["Blue"], keywords: [] }, results: [{ id: "1", name: "Zip Hoodie", matched: ["Hoodies"] }] }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const states: VisualState[] = [];
    render(<VisualSearch onChange={(state) => states.push(state)} />);
    pick(photo());
    await waitFor(() => expect(states.at(-1)?.status).toBe("done"));
    expect(states[0].status).toBe("loading");
    expect(fetchMock.mock.calls[0][1].headers["Content-Type"]).toBe("image/jpeg");
  });

  it("maps provider-busy and failures to friendly errors with a retry", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 503, json: async () => ({}) }));
    const states: VisualState[] = [];
    render(<VisualSearch onChange={(state) => states.push(state)} />);
    pick(photo());
    await waitFor(() => expect(states.at(-1)?.status).toBe("error"));
    const last = states.at(-1);
    expect(last?.status === "error" && last.message).toBe("Photo search is busy, try again shortly");
    expect(last?.status === "error" && typeof last.retry).toBe("function");
  });

  it("tells the shopper to wait when rate limited", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", { status: 429, headers: { "Retry-After": "60" } })));
    const states: VisualState[] = [];
    render(<VisualSearch onChange={(state) => states.push(state)} />);
    pick(photo());
    await waitFor(() => expect(states.at(-1)?.status).toBe("error"));
    const last = states.at(-1);
    expect(last?.status === "error" && last.message).toMatch(/about a minute/);
  });

  it("formats the match description", () => {
    expect(describeMatch({ category: "Hoodies", colors: ["Blue"], keywords: [] })).toBe("Hoodies · Blue");
    expect(describeMatch({ category: null, colors: [], keywords: [] })).toBe("");
  });
});

describe("shop page photo results", () => {
  const catalog = [
    { id: "1", name: "Linen Shirt", category: "Shirts", price: 10, rating: 4, image_url: "/a.jpg", colors: ["Cream"], sizes: ["S"], stock: 5 },
    { id: "2", name: "Zip Hoodie", category: "Hoodies", price: 20, rating: 4, image_url: "/b.jpg", colors: ["Blue"], sizes: ["M"], stock: 5 },
  ];

  beforeEach(() => {
    URL.createObjectURL = vi.fn(() => "blob:thumb");
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) =>
        url.includes("/search/visual")
          ? { ok: true, json: async () => ({ attributes: { category: "Hoodies", colors: ["Blue"], keywords: [] }, results: [{ id: "2", name: "Zip Hoodie", matched: ["Hoodies", "Blue"] }] }) }
          : { ok: true, json: async () => catalog },
      ),
    );
  });
  afterEach(() => vi.unstubAllGlobals());

  it("shows ranked matches with a bar, and Clear restores the previous query", async () => {
    render(<ShopPage />);
    await screen.findByText("Linen Shirt");
    fireEvent.change(screen.getByPlaceholderText("Search products..."), { target: { value: "linen" } });
    pick(photo());
    expect(await screen.findByText("Showing matches for: Hoodies · Blue")).toBeTruthy();
    expect(screen.queryByText("Linen Shirt")).toBeNull();
    expect(screen.getByText("Zip Hoodie")).toBeTruthy();
    fireEvent.click(screen.getByText("Clear"));
    await waitFor(() => expect((screen.getByPlaceholderText("Search products...") as HTMLInputElement).value).toBe("linen"));
    expect(screen.getByText("Linen Shirt")).toBeTruthy();
  });
});

// The mocked module hides the real implementation; assert the pure sizing rule separately.
describe("fitWithin", () => {
  it("is mocked here; see downscaleImage.test.ts for the real behaviour", () => {
    expect(vi.isMockFunction(realFit)).toBe(true);
  });
});
