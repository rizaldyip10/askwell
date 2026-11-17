import type { ComponentProps } from "react";
import { cn } from "./cn";

export type BadgeVariant = "glass" | "solid" | "outline";

const variants: Record<BadgeVariant, string> = {
  glass: "border border-glass-line bg-glass text-fg-muted backdrop-blur-glass-sm",
  solid: "bg-primary text-primary-fg",
  outline: "border border-line text-fg-muted",
};

export type BadgeProps = ComponentProps<"span"> & { variant?: BadgeVariant };

export function Badge({ variant = "glass", className, ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-pill px-3 py-1 text-xs font-medium",
        variants[variant],
        className,
      )}
      {...props}
    />
  );
}
