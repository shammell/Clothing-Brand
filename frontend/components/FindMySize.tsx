"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  clearFitProfile,
  inchesToCm,
  loadFitProfile,
  poundsToKg,
  saveFitProfile,
  type Fit,
} from "@/lib/fit-profile";
import type { Product } from "@/lib/shop-store";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "/api";

type Recommendation = {
  size: string;
  confidence: "high" | "medium";
  in_stock: boolean;
  alternative_size: string | null;
  reason: string;
};
type GuideRow = Record<string, string>;
type Guide = { chart_type: string; rows: GuideRow[]; note: string };

async function fetchRecommendation(productId: string, profile: { height_cm: number; weight_kg: number; fit: Fit }) {
  const response = await fetch(`${API_BASE}/products/${productId}/size-recommendation`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(profile),
  });
  if (!response.ok) throw new Error("recommendation failed");
  const data = await response.json();
  return { chartType: data.chart_type as string, recommendation: (data.recommendation ?? null) as Recommendation | null };
}

export function FindMySize({
  product,
  onSelectSize,
  onRecommendation,
}: {
  product: Product;
  onSelectSize: (size: string) => void;
  // Reports the size to mark "Recommended" (null when there is none).
  onRecommendation: (size: string | null) => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [tab, setTab] = useState<"recommend" | "chart">("recommend");
  const [heightUnit, setHeightUnit] = useState<"cm" | "in">("cm");
  const [weightUnit, setWeightUnit] = useState<"kg" | "lb">("kg");
  const [height, setHeight] = useState("");
  const [weight, setWeight] = useState("");
  const [fit, setFit] = useState<Fit>("regular");
  const [result, setResult] = useState<Recommendation | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [guide, setGuide] = useState<Guide | null>(null);
  const [isShoe, setIsShoe] = useState(false);

  // Returning shoppers see the marker without opening the panel.
  useEffect(() => {
    const profile = loadFitProfile();
    if (!profile) return;
    let cancelled = false;
    fetchRecommendation(product.id, profile)
      .then(({ recommendation }) => {
        if (!cancelled) onRecommendation(recommendation ? (recommendation.in_stock ? recommendation.size : recommendation.alternative_size ?? recommendation.size) : null);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
    // onRecommendation is a setter from the page; the profile is read once per product.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [product.id]);

  const openPanel = () => {
    const profile = loadFitProfile();
    if (profile) {
      setHeight(String(heightUnit === "cm" ? profile.height_cm : Math.round((profile.height_cm / 2.54) * 10) / 10));
      setWeight(String(weightUnit === "kg" ? profile.weight_kg : Math.round((profile.weight_kg / 0.45359237) * 10) / 10));
      setFit(profile.fit);
    }
    dialogRef.current?.showModal();
    // The size chart is cheap and also tells us whether this is a shoe product.
    fetch(`${API_BASE}/products/${product.id}/size-guide`)
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error("guide"))))
      .then((data: Guide) => {
        setGuide(data);
        if (data.chart_type === "shoe") {
          setIsShoe(true);
          setTab("chart");
        }
      })
      .catch(() => setError("Could not load the size chart."));
  };

  const closePanel = () => dialogRef.current?.close();

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    const h = Number(height);
    const w = Number(weight);
    if (!(h > 0) || !(w > 0)) {
      setError("Enter your height and weight.");
      return;
    }
    const profile = {
      height_cm: heightUnit === "cm" ? h : inchesToCm(h),
      weight_kg: weightUnit === "kg" ? w : poundsToKg(w),
      fit,
    };
    setBusy(true);
    try {
      const { recommendation } = await fetchRecommendation(product.id, profile);
      saveFitProfile(profile);
      setResult(recommendation);
      onRecommendation(recommendation ? (recommendation.in_stock ? recommendation.size : recommendation.alternative_size ?? recommendation.size) : null);
      if (!recommendation) setError("We can't recommend a size for this item. Check the size chart.");
    } catch {
      setError("Those measurements look out of range. Please check them.");
    } finally {
      setBusy(false);
    }
  };

  const clear = () => {
    clearFitProfile();
    setHeight("");
    setWeight("");
    setResult(null);
    onRecommendation(null);
  };

  const suggested = result ? (result.in_stock ? result.size : result.alternative_size) : null;

  return (
    <>
      <button type="button" className="find-size-link" onClick={openPanel}>Find my size</button>
      <dialog ref={dialogRef} className="fit-dialog" aria-labelledby="fit-dialog-title" onClick={(event) => event.target === event.currentTarget && closePanel()}>
        <div className="fit-panel">
          <div className="drawer-heading">
            <h2 id="fit-dialog-title">Find my size</h2>
            <button type="button" aria-label="Close" onClick={closePanel}>×</button>
          </div>
          <div role="tablist" className="fit-tabs">
            {!isShoe && (
              <button type="button" role="tab" aria-selected={tab === "recommend"} onClick={() => setTab("recommend")}>Recommend</button>
            )}
            <button type="button" role="tab" aria-selected={tab === "chart"} onClick={() => setTab("chart")}>Size chart</button>
          </div>

          {tab === "recommend" && !isShoe && (
            <form onSubmit={submit} className="fit-form">
              <label>
                Height ({heightUnit})
                <input type="number" step="0.1" min="0" value={height} onChange={(event) => setHeight(event.target.value)} />
              </label>
              <button type="button" className="unit-toggle" onClick={() => setHeightUnit(heightUnit === "cm" ? "in" : "cm")}>
                Use {heightUnit === "cm" ? "inches" : "cm"}
              </button>
              <label>
                Weight ({weightUnit})
                <input type="number" step="0.1" min="0" value={weight} onChange={(event) => setWeight(event.target.value)} />
              </label>
              <button type="button" className="unit-toggle" onClick={() => setWeightUnit(weightUnit === "kg" ? "lb" : "kg")}>
                Use {weightUnit === "kg" ? "pounds" : "kg"}
              </button>
              <label>
                Preferred fit
                <select value={fit} onChange={(event) => setFit(event.target.value as Fit)}>
                  <option value="snug">Snug</option>
                  <option value="regular">Regular</option>
                  <option value="relaxed">Relaxed</option>
                </select>
              </label>
              {error && <p className="size-error" role="alert">{error}</p>}
              <button type="submit" className="primary-button" disabled={busy}>{busy ? "Working..." : "Recommend a size"}</button>
              {result && suggested && (
                <div className="fit-result" role="status">
                  {!result.in_stock && <p>{result.size} would fit best but is sold out. The closest size in stock is {suggested}.</p>}
                  <p><b>We suggest {suggested}</b> ({result.confidence} confidence). {result.reason}</p>
                  <button
                    type="button"
                    className="primary-button"
                    onClick={() => {
                      onSelectSize(suggested);
                      closePanel();
                    }}
                  >
                    Select {suggested}
                  </button>
                </div>
              )}
              <button type="button" className="unit-toggle" onClick={clear}>Clear my measurements</button>
            </form>
          )}

          {tab === "chart" && (
            <div className="fit-chart">
              {guide ? (
                <table>
                  <thead>
                    <tr>{guide.rows[0] && Object.keys(guide.rows[0]).map((key) => <th key={key}>{key.replace("_", " ")}</th>)}</tr>
                  </thead>
                  <tbody>
                    {guide.rows.map((row) => (
                      <tr key={row.size}>{Object.values(row).map((value, index) => <td key={index}>{value}</td>)}</tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p>{error || "Loading chart..."}</p>
              )}
              {guide && <small>{guide.note}</small>}
            </div>
          )}
        </div>
      </dialog>
    </>
  );
}
