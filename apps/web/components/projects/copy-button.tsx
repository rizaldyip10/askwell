"use client";

import { useEffect, useState } from "react";
import { Button } from "../ui/button";
import { copyText } from "./copy-text";

type CopyButtonProps = {
  value: string;
  label?: string;
  /** Called when every copy method is blocked, so the caller can help the user copy by hand. */
  onFailed?: () => void;
};

/** Copies `value` to the clipboard and says so for 2s. */
export function CopyButton({ value, label = "Copy", onFailed }: CopyButtonProps) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");

  useEffect(() => {
    if (state === "idle") return;
    const timer = setTimeout(() => setState("idle"), 2000);
    return () => clearTimeout(timer);
  }, [state]);

  async function copy() {
    const result = await copyText(value);
    setState(result);
    if (result === "failed") onFailed?.();
  }

  return (
    <Button variant="secondary" onClick={copy} aria-live="polite" className="shrink-0">
      {state === "copied" ? "Copied" : state === "failed" ? "Copy failed" : label}
    </Button>
  );
}
