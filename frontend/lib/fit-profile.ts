export type Fit = "snug" | "regular" | "relaxed";
export type FitProfile = { height_cm: number; weight_kg: number; fit: Fit };

export const FIT_PROFILE_KEY = "threadco_fit_profile";

const FITS: Fit[] = ["snug", "regular", "relaxed"];

export function inchesToCm(inches: number): number {
  return Math.round(inches * 2.54 * 10) / 10;
}

export function poundsToKg(pounds: number): number {
  return Math.round(pounds * 0.45359237 * 10) / 10;
}

// Kept on this device only; nothing about it is added to the user record.
export function loadFitProfile(): FitProfile | null {
  if (typeof window === "undefined") return null;
  try {
    const parsed = JSON.parse(localStorage.getItem(FIT_PROFILE_KEY) ?? "null");
    if (
      parsed &&
      typeof parsed.height_cm === "number" &&
      typeof parsed.weight_kg === "number" &&
      FITS.includes(parsed.fit)
    ) {
      return { height_cm: parsed.height_cm, weight_kg: parsed.weight_kg, fit: parsed.fit };
    }
  } catch {
    // fall through to "no profile"
  }
  return null;
}

export function saveFitProfile(profile: FitProfile): void {
  localStorage.setItem(FIT_PROFILE_KEY, JSON.stringify(profile));
  window.dispatchEvent(new Event("threadco:fit-profile"));
}

export function clearFitProfile(): void {
  localStorage.removeItem(FIT_PROFILE_KEY);
  window.dispatchEvent(new Event("threadco:fit-profile"));
}
