import "server-only";

/**
 * The app's origin (no trailing slash), for links that leave the app, like the install snippet.
 * - Vercel preview: `https://${VERCEL_BRANCH_URL}`, so each PR's snippet points at its own preview.
 * - Otherwise (production, local): `NEXT_PUBLIC_APP_URL`.
 * Throws a clear error when the needed variable is missing or isn't an http(s) URL.
 */
export function appUrl(env: NodeJS.ProcessEnv = process.env): string {
  if (env.VERCEL_ENV === "preview" && env.VERCEL_BRANCH_URL) {
    return toOrigin(`https://${env.VERCEL_BRANCH_URL}`, "VERCEL_BRANCH_URL");
  }

  const configured = env.NEXT_PUBLIC_APP_URL?.trim();
  if (!configured) {
    throw new Error(
      env.VERCEL_ENV === "preview"
        ? "appUrl(): VERCEL_BRANCH_URL is missing on this preview, and NEXT_PUBLIC_APP_URL is not set either."
        : "appUrl(): NEXT_PUBLIC_APP_URL is not set. Add the app's URL (e.g. http://localhost:3000) to the environment.",
    );
  }
  return toOrigin(configured, "NEXT_PUBLIC_APP_URL");
}

function toOrigin(value: string, name: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`appUrl(): ${name} is not a valid URL.`);
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error(`appUrl(): ${name} must be an http(s) URL.`);
  }
  return url.origin;
}
