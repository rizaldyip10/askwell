import type { ComponentProps } from "react";
import { cn } from "../ui/cn";
import { TAP_HEIGHT } from "../ui/tap-target";

/** Text input in the dashboard style. */
export function TextInput({ className, ...props }: ComponentProps<"input">) {
  return (
    <input
      className={cn(
        `h-10 ${TAP_HEIGHT} w-full min-w-0 rounded-control border border-glass-line bg-glass-strong px-3 text-sm text-fg`,
        "placeholder:text-fg-subtle focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fg",
        "aria-invalid:border-fg",
        className,
      )}
      {...props}
    />
  );
}

/** Inline error under a field. Rendered as text. */
export function FieldError({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <p id={id} role="alert" className="mt-2 text-sm text-fg">
      {children}
    </p>
  );
}
