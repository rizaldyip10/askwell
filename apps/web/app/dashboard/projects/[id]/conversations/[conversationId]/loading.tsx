import { GlassPanel } from "../../../../../../components/ui/glass-panel";

export default function ConversationLoading() {
  return (
    <div role="status" aria-live="polite" className="motion-safe:animate-pulse">
      <span className="sr-only">Loading conversation…</span>
      <div aria-hidden="true">
        <div className="mb-4 h-4 w-32 rounded-control bg-glass-strong" />
        <div className="mb-2 h-7 w-40 rounded-control bg-glass-strong" />
        <div className="mb-8 h-4 w-64 max-w-full rounded-control bg-glass-strong" />
        <GlassPanel className="flex flex-col gap-4 p-4 sm:p-6">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className={i % 2 ? "flex justify-end" : "flex"}>
              <div className="h-12 w-3/5 rounded-panel bg-glass-strong" />
            </div>
          ))}
        </GlassPanel>
      </div>
    </div>
  );
}
