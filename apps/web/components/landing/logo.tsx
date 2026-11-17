/** Mark: a speech bubble. Decorative; the app name sits next to it. */
export function Logo({ className = "size-6" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className} fill="none">
      <rect x="2" y="3" width="20" height="15" rx="5" className="fill-fg" />
      <path d="M7 18v3.5L11.5 18" className="fill-fg" />
      <circle cx="8" cy="10.5" r="1.4" className="fill-canvas" />
      <circle cx="12" cy="10.5" r="1.4" className="fill-canvas" />
      <circle cx="16" cy="10.5" r="1.4" className="fill-canvas" />
    </svg>
  );
}
