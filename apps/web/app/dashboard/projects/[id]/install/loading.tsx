import { GlassPanel } from "../../../../../components/ui/glass-panel";

export default function InstallLoading() {
  return (
    <div role="status" aria-live="polite" className="motion-safe:animate-pulse">
      <span className="sr-only">Loading install steps…</span>
      <div aria-hidden="true">
        <div className="mb-2 h-7 w-32 rounded-control bg-glass-strong" />
        <div className="mb-8 h-4 w-72 max-w-full rounded-control bg-glass-strong" />
        <GlassPanel className="flex flex-col gap-8 p-5 sm:p-6">
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex gap-4">
              <div className="size-7 shrink-0 rounded-pill bg-glass-strong" />
              <div className="flex min-w-0 flex-1 flex-col gap-2">
                <div className="h-5 w-44 max-w-full rounded-control bg-glass-strong" />
                <div className="h-4 w-full rounded-control bg-glass-strong" />
                {i === 0 ? <div className="mt-2 h-24 w-full rounded-panel bg-glass-strong" /> : null}
              </div>
            </div>
          ))}
        </GlassPanel>
      </div>
    </div>
  );
}
