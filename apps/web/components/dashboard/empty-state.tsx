import type { ReactNode } from "react";
import { GlassPanel } from "../ui/glass-panel";

type EmptyStateProps = {
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  role?: "status" | "alert";
};

/** Centered glass panel for empty, error and placeholder screens (§13 States). */
export function EmptyState({ title, description, action, role }: EmptyStateProps) {
  return (
    <GlassPanel role={role} className="mx-auto flex max-w-lg flex-col items-center px-6 py-12 text-center">
      <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
      {description ? <p className="mt-2 text-sm text-pretty text-fg-muted">{description}</p> : null}
      {action ? <div className="mt-6">{action}</div> : null}
    </GlassPanel>
  );
}
