import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const pathnameMock = vi.hoisted(() => ({ value: "/shop" }));
vi.mock("next/navigation", () => ({ usePathname: () => pathnameMock.value }));

import { StyleAssistant } from "./StyleAssistant";

function reply(body: unknown, status = 200) {
  return vi.fn().mockResolvedValue({ ok: status < 400, status, json: async () => body });
}

function open() {
  fireEvent.click(screen.getByLabelText("Open style assistant"));
}

describe("StyleAssistant", () => {
  beforeEach(() => {
    localStorage.clear();
    pathnameMock.value = "/shop";
  });
  afterEach(() => vi.unstubAllGlobals());

  it("renders product cards from the response and links to the product page", async () => {
    vi.stubGlobal("fetch", reply({ reply: "Try this.", products: [{ id: "p1", name: "Zip Hoodie", price: 44.99, image_url: "/h.jpg" }] }));
    render(<StyleAssistant />);
    open();
    fireEvent.change(screen.getByLabelText("Message the style assistant"), { target: { value: "hoodie?" } });
    fireEvent.click(screen.getByLabelText("Send message"));
    const card = await screen.findByText("Zip Hoodie");
    expect(card.closest("a")?.getAttribute("href")).toBe("/products/p1");
    expect(screen.getByText("$44.99")).toBeTruthy();
  });

  it("keeps history across remounts", async () => {
    vi.stubGlobal("fetch", reply({ reply: "Sure thing.", products: [] }));
    const first = render(<StyleAssistant />);
    open();
    fireEvent.click(screen.getByText("Help me find an outfit"));
    await screen.findByText("Sure thing.");
    first.unmount();
    render(<StyleAssistant />);
    open();
    await waitFor(() => expect(screen.getByText("Sure thing.")).toBeTruthy());
  });

  it("sends the product id on a product page and offers contextual suggestions", async () => {
    pathnameMock.value = "/products/abc123";
    const fetchMock = reply({ reply: "Medium.", products: [] });
    vi.stubGlobal("fetch", fetchMock);
    render(<StyleAssistant />);
    open();
    fireEvent.click(screen.getByText("What size should I get?"));
    await screen.findByText("Medium.");
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).product_id).toBe("abc123");
  });

  it("shows a retry when the provider is busy and recovers on retry", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 503, json: async () => ({}) })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ reply: "Back now.", products: [] }) });
    vi.stubGlobal("fetch", fetchMock);
    render(<StyleAssistant />);
    open();
    fireEvent.click(screen.getByText("What's new?"));
    expect(await screen.findByText(/helping a lot of people/)).toBeTruthy();
    fireEvent.click(screen.getByText("Try again"));
    await screen.findByText("Back now.");
  });

  it("explains a rate limit instead of calling the assistant unavailable", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", { status: 429, headers: { "Retry-After": "86400" } })));
    render(<StyleAssistant />);
    open();
    fireEvent.click(screen.getByText("What's new?"));
    expect(await screen.findByText(/has reached its limit/)).toBeTruthy();
  });

  it("is hidden on admin pages and closes with Escape", () => {
    const { rerender, container } = render(<StyleAssistant />);
    open();
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    pathnameMock.value = "/admin";
    rerender(<StyleAssistant />);
    expect(container.innerHTML).toBe("");
  });
});
