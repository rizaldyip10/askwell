"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";

type DialogProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: ReactNode;
  children: ReactNode;
};

/** A modal on the native <dialog>: focus trap, Escape to close and the backdrop come from the browser. */
export function Dialog({ open, onClose, title, description, children }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      className="m-auto w-[calc(100%-2rem)] max-w-md rounded-panel border border-glass-line bg-glass-strong p-6 text-fg shadow-glass backdrop-blur-glass-lg backdrop:bg-black/20 backdrop:backdrop-blur-sm"
    >
      <h2 id={titleId} className="text-lg font-semibold tracking-tight break-words">
        {title}
      </h2>
      {description ? (
        <div id={descriptionId} className="mt-2 text-sm text-pretty text-fg-muted">
          {description}
        </div>
      ) : null}
      <div className="mt-6">{open ? children : null}</div>
    </dialog>
  );
}
