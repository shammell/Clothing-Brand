"use client";

import { useRef, useState, type DragEvent } from "react";
import { downscaleImage } from "@/lib/downscaleImage";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "/api";

export type VisualMatch = { id: string; name: string; matched: string[] };
export type VisualAttributes = { category: string | null; colors: string[]; keywords: string[] };
export type VisualState =
  | { status: "idle" }
  | { status: "loading"; thumbnail: string }
  | { status: "error"; message: string; thumbnail: string; retry: () => void }
  | { status: "done"; thumbnail: string; attributes: VisualAttributes; results: VisualMatch[] };

export function describeMatch(attributes: VisualAttributes): string {
  return [attributes.category, ...attributes.colors, ...attributes.keywords].filter(Boolean).join(" · ");
}

async function errorMessage(response: Response): Promise<string> {
  if (response.status === 503) return "Photo search is busy, try again shortly";
  if (response.status === 413) return "That photo is too large";
  if (response.status === 415) return "Please choose a JPEG, PNG or WebP photo";
  try {
    const data = await response.json();
    if (response.status === 422 && typeof data.detail === "string") return data.detail;
  } catch {
    // fall through
  }
  return "Photo search is unavailable right now";
}

// Camera button + drop zone. Owns the upload; the page owns what to show.
export function VisualSearch({ onChange }: { onChange: (state: VisualState) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const search = async (file: File) => {
    const thumbnail = URL.createObjectURL(file);
    onChange({ status: "loading", thumbnail });
    const retry = () => search(file);
    try {
      const body = await downscaleImage(file);
      const response = await fetch(`${API_BASE}/search/visual`, {
        method: "POST",
        headers: { "Content-Type": "image/jpeg" },
        body,
      });
      if (!response.ok) {
        onChange({ status: "error", message: await errorMessage(response), thumbnail, retry });
        return;
      }
      const data = await response.json();
      onChange({ status: "done", thumbnail, attributes: data.attributes, results: data.results });
    } catch {
      onChange({ status: "error", message: "We couldn't process that photo. Please try another.", thumbnail, retry });
    }
  };

  const onDrop = (event: DragEvent) => {
    event.preventDefault();
    setDragging(false);
    const file = event.dataTransfer.files?.[0];
    if (file && file.type.startsWith("image/")) search(file);
  };

  return (
    <>
      <button type="button" className="photo-button" aria-label="Search by photo" onClick={() => inputRef.current?.click()}>
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M4 8h3l2-3h6l2 3h3v11H4z" />
          <circle cx="12" cy="13" r="3.5" />
        </svg>
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        hidden
        aria-label="Choose a photo"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) search(file);
          event.target.value = "";
        }}
      />
      <div
        className={`photo-drop${dragging ? " dragging" : ""}`}
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
      >
        or drop a photo here
      </div>
    </>
  );
}
