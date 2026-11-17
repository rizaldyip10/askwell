"use client";

import { useEffect } from "react";

/**
 * Fades in every `[data-reveal]` element as it scrolls into view.
 * CSS in globals.css does the animation; this only flips `data-revealed`.
 * Under `prefers-reduced-motion` the CSS shows everything at once.
 */
export function RevealObserver() {
  useEffect(() => {
    const root = document.documentElement;
    const targets = Array.from(document.querySelectorAll<HTMLElement>("[data-reveal]"));

    if (!("IntersectionObserver" in window)) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            (entry.target as HTMLElement).dataset.revealed = "true";
            observer.unobserve(entry.target);
          }
        }
      },
      { rootMargin: "0px 0px -10% 0px", threshold: 0.1 },
    );

    root.classList.add("reveal-ready");
    for (const el of targets) observer.observe(el);

    return () => {
      observer.disconnect();
      root.classList.remove("reveal-ready");
    };
  }, []);

  return null;
}
