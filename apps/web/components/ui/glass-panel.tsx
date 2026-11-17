import type { ComponentProps, ElementType } from "react";
import { cn } from "./cn";

type GlassPanelProps<T extends ElementType> = {
  as?: T;
  strong?: boolean;
} & Omit<ComponentProps<T>, "as">;

/** A blurred, translucent surface. Works on both the light and dark theme. */
export function GlassPanel<T extends ElementType = "div">({
  as,
  strong = false,
  className,
  ...props
}: GlassPanelProps<T>) {
  const Tag: ElementType = as ?? "div";
  return (
    <Tag
      className={cn(
        "rounded-panel border border-glass-line shadow-glass",
        strong ? "bg-glass-strong backdrop-blur-glass-lg" : "bg-glass backdrop-blur-glass",
        className,
      )}
      {...props}
    />
  );
}
