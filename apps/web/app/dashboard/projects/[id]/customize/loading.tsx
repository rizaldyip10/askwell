import { GlassPanel } from "../../../../../components/ui/glass-panel";

export default function CustomizeLoading() {
  return (
    <div role="status" aria-live="polite" className="motion-safe:animate-pulse">
      <span className="sr-only">Loading the widget settings…</span>
      <div aria-hidden="true">
        <div className="mb-2 h-7 w-48 rounded-control bg-glass-strong" />
        <div className="mb-8 h-4 w-72 max-w-full rounded-control bg-glass-strong" />
        <div className="grid gap-6 lg:grid-cols-2">
          <GlassPanel className="flex flex-col gap-6 p-5 sm:p-6">
            {[0, 1, 2, 3, 4].map((i) => (
              <div key={i} className="flex flex-col gap-2">
                <div className="h-4 w-28 rounded-control bg-glass-strong" />
                <div className="h-10 w-full rounded-control bg-glass-strong" />
              </div>
            ))}
          </GlassPanel>
          <GlassPanel className="p-5 sm:p-6">
            <div className="h-[460px] rounded-panel bg-glass-strong" />
          </GlassPanel>
        </div>
      </div>
    </div>
  );
}
