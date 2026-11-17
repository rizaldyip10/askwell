import { GlassPanel } from "../../components/ui/glass-panel";

export default function DashboardLoading() {
  return (
    <div role="status" aria-live="polite" className="motion-safe:animate-pulse">
      <span className="sr-only">Loading…</span>
      <div aria-hidden="true">
        <div className="mb-2 h-7 w-40 rounded-control bg-glass-strong" />
        <div className="mb-8 h-4 w-64 max-w-full rounded-control bg-glass-strong" />
        <GlassPanel className="mx-auto h-48 max-w-lg" />
      </div>
    </div>
  );
}
