export type CopyResult = "copied" | "failed";

type CopyDeps = {
  clipboard?: Pick<Clipboard, "writeText">;
  document?: Pick<Document, "createElement" | "execCommand" | "body" | "activeElement">;
};

/**
 * Copy `value`: the Clipboard API first, then the legacy `execCommand("copy")` for browsers or
 * frames where the API is blocked. Never throws. "failed" means the caller should let the user
 * copy by hand.
 */
export async function copyText(
  value: string,
  deps: CopyDeps = {
    clipboard: typeof navigator === "undefined" ? undefined : navigator.clipboard,
    document: typeof document === "undefined" ? undefined : document,
  },
): Promise<CopyResult> {
  if (deps.clipboard) {
    try {
      await deps.clipboard.writeText(value);
      return "copied";
    } catch {
      // Blocked (permissions policy, insecure context). Try the fallback.
    }
  }

  const doc = deps.document;
  if (!doc?.body) return "failed";
  const previousFocus = doc.activeElement as HTMLElement | null;
  const textarea = doc.createElement("textarea");
  textarea.value = value;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  doc.body.appendChild(textarea);
  textarea.select();
  try {
    return doc.execCommand("copy") ? "copied" : "failed";
  } catch {
    return "failed";
  } finally {
    textarea.remove();
    previousFocus?.focus?.();
  }
}
