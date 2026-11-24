import { CodeBlock } from "../ui/code-block";
import { Container } from "../ui/container";
import { SectionHeading } from "../ui/section-heading";

/** Placeholder key. The real snippet, with the project's public key, lives in the dashboard's Install page. */
export const EXAMPLE_PUBLIC_KEY = "pk_your_public_key";

/** The example snippet, loading from `appUrl`. Same attributes as the dashboard's (`defer`), split over lines to fit. */
export function installSnippet(appUrl: string): string {
  return `<script
  src="${appUrl}/widget.js"
  data-key="${EXAMPLE_PUBLIC_KEY}"
  defer
></script>`;
}

const STEPS = ["Create a project and copy its snippet.", "Paste it before </body> on your site.", "Reload. The chat button appears."];

/** `appUrl` is the app's origin from `appUrl()` (server only), so each environment shows its own URL. */
export function Install({ appUrl }: { appUrl: string }) {
  return (
    <section id="install" aria-labelledby="install-title" className="scroll-mt-20 py-20 sm:py-28">
      <Container className="grid items-center gap-12 lg:grid-cols-2">
        <div data-reveal>
          <SectionHeading
            id="install-title"
            align="left"
            eyebrow="Install"
            title="One script tag. Any website."
            description="No build step, no plugin. It runs in its own frame, so it never touches your page's styles."
          />
          <ol className="mt-8 space-y-3">
            {STEPS.map((s, i) => (
              <li key={s} className="flex gap-3 text-fg-muted">
                <span className="font-mono text-sm text-fg-subtle">0{i + 1}</span>
                <span>{s}</span>
              </li>
            ))}
          </ol>
        </div>
        <div data-reveal className="min-w-0">
          <CodeBlock label="index.html" code={installSnippet(appUrl)} />
        </div>
      </Container>
    </section>
  );
}
