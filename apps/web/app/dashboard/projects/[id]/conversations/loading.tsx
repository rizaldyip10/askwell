import { GlassPanel } from "../../../../../components/ui/glass-panel";

export default function ConversationsLoading() {
  return (
    <div role="status" aria-live="polite" className="motion-safe:animate-pulse">
      <span className="sr-only">Loading conversations…</span>
      <div aria-hidden="true">
        <div className="mb-2 h-7 w-48 rounded-control bg-glass-strong" />
        <div className="mb-8 h-4 w-72 max-w-full rounded-control bg-glass-strong" />
        <GlassPanel className="flex flex-col gap-5 p-5">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="flex items-center justify-between gap-4">
              <div className="h-4 w-2/3 rounded-control bg-glass-strong" />
              <div className="h-3 w-24 shrink-0 rounded-control bg-glass-strong" />
            </div>
          ))}
        </GlassPanel>
      </div>
    </div>
  );
}
