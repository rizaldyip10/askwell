# Widget loader

`src/` is the script customers paste (`<script src="<app>/widget.js" data-key="pk_…" defer>`).
esbuild bundles it to `dist/widget.js`, and the web app's build copies it to `apps/web/public/widget.js`
(served at `<app origin>/widget.js`). See `docs/project.md` §6.5.

| Command | Does |
|---|---|
| `pnpm --filter @askwell/widget build` | Builds `dist/widget.js` (minified IIFE) |
| `pnpm --filter @askwell/widget test` | Vitest with happy-dom |
| `pnpm --filter @askwell/widget typecheck` | `tsc --noEmit` |

## Testing cross-origin against a Vercel preview

The widget only proves itself on a page from **another origin**, the way a customer's site loads it.

1. **Get a key.** Sign in on the preview, create a project, open **Install**, and copy the snippet.
   Its `src` already points at the preview (`appUrl()` uses `VERCEL_BRANCH_URL` on previews).
2. **Serve a plain page from another origin**, containing only the snippet:
   ```bash
   mkdir -p /tmp/host && cd /tmp/host
   printf '<!doctype html><title>Host</title><h1>Host page</h1>\n%s\n' '<paste the snippet>' > index.html
   python3 -m http.server 5050   # http://localhost:5050
   ```
3. **Get past preview protection.** Previews need `x-vercel-protection-bypass: $VERCEL_AUTOMATION_BYPASS_SECRET`
   on every request to the preview. A normal browser can't add headers to a third-party `<script>` or
   `<iframe>`, so use one of these:
   - **Playwright** (recommended): `context.route("<preview>/**", r => r.continue({ headers: { ...r.request().headers(), "x-vercel-protection-bypass": secret } }))`.
     It adds the header to the script, the config fetch and the `/embed` iframe.
   - **Bypass cookie:** open `<preview>/embed` once with `x-vercel-protection-bypass` and
     `x-vercel-set-bypass-cookie: samesitenone`. The cookie then works inside the third-party iframe.
     Send `x-vercel-set-bypass-cookie` only on that one document request: on every request it makes
     Vercel redirect in a loop (`ERR_TOO_MANY_REDIRECTS`).
4. **Check:**
   - The button appears bottom right ("Ask us", black by default).
   - Click → the panel opens with the project's header and, on Free, "Powered by Askwell".
   - Send a message → typing → the mock reply.
   - The ✕ button, Escape inside the panel, and Escape on the host page all close it.
   - With an unknown `data-key`, nothing renders and the host page logs only one `[askwell]` warning.
     `/embed?key=<unknown>&origin=…` is an empty page.

Notes:
- Press Escape only after the panel has hydrated (it posts `askwell:ready`). The header is
  server-rendered and shows a moment before the key listener is attached.
- Clerk's sign-up bot check (Turnstile) doesn't load in headless Chromium. Sign in with a
  `+clerk_test` user instead; the email code is always `424242`.
