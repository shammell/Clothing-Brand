import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { FindMySize } from "./FindMySize";
import { inchesToCm, loadFitProfile, poundsToKg, saveFitProfile } from "@/lib/fit-profile";
import type { Product } from "@/lib/shop-store";

const product: Product = {
  id: "p1", name: "Tee", category: "T-Shirts", price: 10, rating: 4, image: "/x",
  sizes: ["S", "M", "L"], colors: ["Black"],
};

const recommendation = { size: "M", confidence: "high", in_stock: true, alternative_size: null, reason: "Based on test." };

function mockApi(overrides: Record<string, unknown> = {}) {
  return vi.fn(async (url: string) => {
    if (url.endsWith("/size-guide")) {
      return { ok: true, json: async () => ({ chart_type: "alpha", rows: [{ size: "M", weight_kg: "65-75" }], note: "Placeholder" }) };
    }
    return { ok: true, json: async () => ({ chart_type: "alpha", recommendation, ...overrides }) };
  });
}

describe("FindMySize", () => {
  beforeEach(() => {
    localStorage.clear();
    HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
      this.setAttribute("open", "");
    };
    HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
      this.removeAttribute("open");
    };
  });
  afterEach(() => vi.unstubAllGlobals());

  it("converts inches and pounds", () => {
    expect(inchesToCm(70)).toBe(177.8);
    expect(poundsToKg(154)).toBe(69.9);
  });

  it("recommends, then selects the suggested size and saves the profile", async () => {
    vi.stubGlobal("fetch", mockApi());
    const onSelectSize = vi.fn();
    const onRecommendation = vi.fn();
    render(<FindMySize product={product} onSelectSize={onSelectSize} onRecommendation={onRecommendation} />);
    fireEvent.click(screen.getAllByText("Find my size")[0]);
    fireEvent.change(screen.getByLabelText(/Height/), { target: { value: "175" } });
    fireEvent.change(screen.getByLabelText(/Weight/), { target: { value: "70" } });
    fireEvent.click(screen.getByText("Recommend a size"));
    expect(await screen.findByText(/We suggest M/)).toBeTruthy();
    expect(onRecommendation).toHaveBeenCalledWith("M");
    expect(loadFitProfile()).toEqual({ height_cm: 175, weight_kg: 70, fit: "regular" });
    fireEvent.click(screen.getByText("Select M"));
    expect(onSelectSize).toHaveBeenCalledWith("M");
  });

  it("offers the in-stock alternative when the best size is sold out", async () => {
    vi.stubGlobal("fetch", mockApi({ recommendation: { ...recommendation, in_stock: false, alternative_size: "L" } }));
    const onSelectSize = vi.fn();
    render(<FindMySize product={product} onSelectSize={onSelectSize} onRecommendation={() => {}} />);
    fireEvent.click(screen.getAllByText("Find my size")[0]);
    fireEvent.change(screen.getByLabelText(/Height/), { target: { value: "175" } });
    fireEvent.change(screen.getByLabelText(/Weight/), { target: { value: "70" } });
    fireEvent.click(screen.getByText("Recommend a size"));
    expect(await screen.findByText(/closest size in stock is L/)).toBeTruthy();
    fireEvent.click(screen.getByText("Select L"));
    expect(onSelectSize).toHaveBeenCalledWith("L");
  });

  it("marks the recommended size on load from a stored profile, and clearing removes it", async () => {
    saveFitProfile({ height_cm: 175, weight_kg: 70, fit: "regular" });
    vi.stubGlobal("fetch", mockApi());
    const onRecommendation = vi.fn();
    render(<FindMySize product={product} onSelectSize={() => {}} onRecommendation={onRecommendation} />);
    await waitFor(() => expect(onRecommendation).toHaveBeenCalledWith("M"));
    fireEvent.click(screen.getAllByText("Find my size")[0]);
    fireEvent.click(screen.getByText("Clear my measurements"));
    expect(loadFitProfile()).toBeNull();
    expect(onRecommendation).toHaveBeenLastCalledWith(null);
  });

  it("shows only the chart for shoes", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ chart_type: "shoe", rows: [{ size: "9", foot_length: "26.7 cm" }], note: "n" }) })));
    render(<FindMySize product={{ ...product, category: "Shoes", sizes: ["9"] }} onSelectSize={() => {}} onRecommendation={() => {}} />);
    fireEvent.click(screen.getAllByText("Find my size")[0]);
    await screen.findByText("26.7 cm");
    expect(screen.queryByText("Recommend")).toBeNull();
  });
});
