// Env checks for the Supabase clients. They run when a client is created, never at import
// time, so `next build` works in CI with no env vars set.

export class MissingEnvError extends Error {
  constructor(client: string, names: string[]) {
    super(
      `${client} needs ${names.join(", ")}. ` +
        "Set them in .env.local (local) or in the Vercel project's environment variables (see .env.example).",
    );
    this.name = "MissingEnvError";
  }
}

/**
 * Returns the given env values, or throws one error naming every missing (or empty) one.
 * Callers pass `process.env.X` literally so Next.js can inline NEXT_PUBLIC_* values.
 */
export function requireEnv<K extends string>(
  client: string,
  vars: Record<K, string | undefined>,
): Record<K, string> {
  const entries = Object.entries(vars) as [K, string | undefined][];
  const missing = entries.filter(([, value]) => !value).map(([name]) => name);
  if (missing.length > 0) throw new MissingEnvError(client, missing);
  return vars as Record<K, string>;
}
