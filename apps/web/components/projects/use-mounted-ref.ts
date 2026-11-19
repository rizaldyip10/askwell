"use client";

import { useEffect, useRef } from "react";

/**
 * `ref.current` is false once the component has unmounted. A form inside a dialog uses it to
 * ignore the late result of a request after the dialog was dismissed: that result must not
 * close or reset a dialog the user has since reopened.
 */
export function useMountedRef() {
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  return mounted;
}
