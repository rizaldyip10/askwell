"use client";

import { useEffect, useRef, type RefObject } from "react";

/**
 * Tracks whether the panel is out of sight: the tab is hidden, or the loader has
 * hidden the iframe (it then stops intersecting the viewport). Best effort: the
 * loader (P2P-T09) decides how it hides the iframe. Returns a ref, so reading it
 * never re-renders, plus a callback for the moment the panel shows again.
 */
export function usePanelHidden(target: RefObject<HTMLElement | null>, onShown: () => void): RefObject<boolean> {
  const hidden = useRef(false);
  const onShownRef = useRef(onShown);

  useEffect(() => {
    onShownRef.current = onShown;
  });

  useEffect(() => {
    let tabHidden = document.visibilityState === "hidden";
    let offscreen = false;
    const update = () => {
      const next = tabHidden || offscreen;
      if (hidden.current && !next) onShownRef.current();
      hidden.current = next;
    };
    const onVisibility = () => {
      tabHidden = document.visibilityState === "hidden";
      update();
    };
    document.addEventListener("visibilitychange", onVisibility);

    let observer: IntersectionObserver | undefined;
    if (target.current && typeof IntersectionObserver !== "undefined") {
      observer = new IntersectionObserver((entries) => {
        offscreen = !entries.some((entry) => entry.isIntersecting);
        update();
      });
      observer.observe(target.current);
    }
    update();
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      observer?.disconnect();
    };
  }, [target]);

  return hidden;
}
