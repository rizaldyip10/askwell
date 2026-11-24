import Link from "next/link";
import type { ComponentProps } from "react";
import { cn } from "./cn";
import { TAP_HEIGHT } from "./tap-target";

export type ButtonVariant = "primary" | "secondary" | "ghost";
export type ButtonSize = "md" | "lg";

const base =
  "inline-flex items-center justify-center gap-2 rounded-pill font-medium whitespace-nowrap transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fg disabled:pointer-events-none disabled:opacity-50";

const variants: Record<ButtonVariant, string> = {
  primary: "bg-primary text-primary-fg hover:bg-primary-hover",
  secondary:
    "border border-glass-line bg-glass text-fg backdrop-blur-glass-sm hover:bg-glass-strong",
  ghost: "text-fg-muted hover:bg-glass hover:text-fg",
};

const sizes: Record<ButtonSize, string> = {
  md: `h-10 px-4 text-sm ${TAP_HEIGHT}`,
  lg: "h-12 px-6 text-base",
};

type StyleProps = { variant?: ButtonVariant; size?: ButtonSize };

export function buttonClasses({ variant = "primary", size = "md" }: StyleProps = {}): string {
  return cn(base, variants[variant], sizes[size]);
}

export type ButtonProps = ComponentProps<"button"> & StyleProps;

export function Button({ variant, size, className, type = "button", ...props }: ButtonProps) {
  return <button type={type} className={cn(buttonClasses({ variant, size }), className)} {...props} />;
}

export type ButtonLinkProps = ComponentProps<typeof Link> & StyleProps;

/** A link styled as a button. */
export function ButtonLink({ variant, size, className, ...props }: ButtonLinkProps) {
  return <Link className={cn(buttonClasses({ variant, size }), className)} {...props} />;
}
