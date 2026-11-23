import { GlassPanel } from "../../../components/ui/glass-panel";

export default function BillingLoading() {
  return (
    <div role="status" aria-live="polite" className="motion-safe:animate-pulse">
      <span className="sr-only">Loading billing…</span>
      <div aria-hidden="true">
        <div className="mb-2 h-7 w-32 rounded-control bg-glass-strong" />
        <div className="mb-8 h-4 w-72 max-w-full rounded-control bg-glass-strong" />
        <GlassPanel className="mb-6 h-40" />
        <GlassPanel className="h-72" />
      </div>
    </div>
  );
}
