"use client";

import { useCallback, useState, ViewTransition } from "react";
import { FALLBACK_IMAGE } from "@/lib/shop-store";

type Props = {
  src: string;
  alt: string;
  priority?: boolean;
  className?: string;
  // Names the image for the card -> product page shared-element morph.
  transitionName?: string;
};

// The parent supplies the aspect-ratio box and skeleton-toned background; this
// fades the picture in over it once loaded and falls back when the URL is broken.
export function ProductImage({ src, alt, priority = false, className, transitionName }: Props) {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);

  // An image served from cache can finish loading before React attaches onLoad.
  const ref = useCallback((node: HTMLImageElement | null) => {
    if (node?.complete && node.naturalWidth > 0) setLoaded(true);
  }, []);

  const image = (
    <img
      ref={ref}
      src={failed ? FALLBACK_IMAGE : src}
      alt={alt}
      loading={priority ? "eager" : "lazy"}
      decoding="async"
      className={`product-img${loaded ? " loaded" : ""}${className ? ` ${className}` : ""}`}
      onLoad={() => setLoaded(true)}
      onError={() => {
        setFailed(true);
        setLoaded(true);
      }}
    />
  );
  return transitionName ? (
    <ViewTransition name={transitionName} share="morph" default="none">
      {image}
    </ViewTransition>
  ) : (
    image
  );
}
