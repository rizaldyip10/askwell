import { cn } from "./cn";

type CodeBlockProps = {
  code: string;
  /** Shown in the panel's title bar, e.g. "index.html". */
  label?: string;
  className?: string;
};

/** Read-only code panel. The code is rendered as text, never HTML. */
export function CodeBlock({ code, label, className }: CodeBlockProps) {
  return (
    <figure
      className={cn(
        "overflow-hidden rounded-panel border border-glass-line bg-glass shadow-glass backdrop-blur-glass",
        className,
      )}
    >
      {label ? (
        <figcaption className="flex items-center gap-2 border-b border-glass-line px-4 py-2.5 text-xs text-fg-subtle">
          <span aria-hidden="true" className="flex gap-1.5">
            <span className="size-2.5 rounded-pill bg-glass-strong" />
            <span className="size-2.5 rounded-pill bg-glass-strong" />
            <span className="size-2.5 rounded-pill bg-glass-strong" />
          </span>
          <span className="font-mono">{label}</span>
        </figcaption>
      ) : null}
      <pre className="overflow-x-auto p-4 font-mono text-[13px] leading-relaxed text-fg sm:text-sm">
        <code>{code}</code>
      </pre>
    </figure>
  );
}
