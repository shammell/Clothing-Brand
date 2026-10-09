"use client";

import { useEffect, useRef, useState } from "react";

// Scroll-reveal primitive: toggles isVisible once the element first
// intersects the viewport, then disconnects - a one-shot reveal, not a
// repeating show/hide on every scroll past the element.
export function useInViewport<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.15 },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return { ref, isVisible };
}
