import { APP_NAME } from "@askwell/shared";
import { Container } from "../ui/container";
import { GlassPanel } from "../ui/glass-panel";
import { SectionHeading } from "../ui/section-heading";
import { cn } from "../ui/cn";
import { Logo } from "./logo";

type DemoMessage = { role: "visitor" | "bot"; text: string };

// Static mock. The live widget replaces this in Phase 6.
const MESSAGES: readonly DemoMessage[] = [
  { role: "visitor", text: "Hi! Can I use this on a Shopify store?" },
  {
    role: "bot",
    text: `Yes. ${APP_NAME} works on any site that lets you add a script tag, Shopify included. Paste the snippet from Install into your theme and the chat button shows up.`,
  },
  { role: "visitor", text: "Does it answer from my own docs?" },
  {
    role: "bot",
    text: "It does. Upload a PDF or paste text in Knowledge, and replies are based on that content.",
  },
];

export function Demo() {
  return (
    <section id="demo" aria-labelledby="demo-title" className="scroll-mt-20 py-20 sm:py-28">
      <Container className="grid items-center gap-12 lg:grid-cols-2">
        <div data-reveal>
          <SectionHeading
            id="demo-title"
            align="left"
            eyebrow="Live demo"
            title="A support chat that knows your product"
            description="Visitors open the chat, ask in their own words and get a clear answer. You read every conversation later."
          />
        </div>

        <div data-reveal className="flex flex-col items-end gap-4">
          <GlassPanel
            strong
            role="region"
            aria-label={`${APP_NAME} chat preview`}
            className="w-full max-w-md overflow-hidden shadow-glow"
          >
            <div className="flex items-center gap-3 border-b border-glass-line px-4 py-3">
              <span className="flex size-8 items-center justify-center rounded-pill bg-primary">
                <Logo className="size-4 [&_.fill-fg]:fill-primary-fg [&_.fill-canvas]:fill-primary" />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-semibold">{APP_NAME}</p>
                <p className="text-xs text-fg-subtle">Usually replies instantly</p>
              </div>
            </div>

            <ul className="flex flex-col gap-3 p-4">
              {MESSAGES.map((m, i) => (
                <li key={i} className={cn("flex", m.role === "visitor" ? "justify-end" : "justify-start")}>
                  <p
                    className={cn(
                      "max-w-[85%] rounded-panel px-4 py-2.5 text-sm leading-relaxed break-words",
                      m.role === "visitor"
                        ? "rounded-br-control bg-primary text-primary-fg"
                        : "rounded-bl-control border border-glass-line bg-glass text-fg",
                    )}
                  >
                    <span className="sr-only">{m.role === "visitor" ? "Visitor: " : "Bot: "}</span>
                    {m.text}
                  </p>
                </li>
              ))}
              <li className="flex justify-start" aria-label="Bot is typing">
                <span className="flex gap-1 rounded-panel rounded-bl-control border border-glass-line bg-glass px-4 py-3">
                  {[0, 1, 2].map((d) => (
                    <span
                      key={d}
                      aria-hidden="true"
                      className="size-1.5 rounded-pill bg-fg-subtle motion-safe:animate-pulse"
                      style={{ animationDelay: `${d * 150}ms` }}
                    />
                  ))}
                </span>
              </li>
            </ul>

            <div className="border-t border-glass-line p-3">
              <div className="flex items-center gap-2 rounded-pill border border-glass-line bg-glass px-4 py-2 text-sm text-fg-subtle">
                <span className="flex-1 truncate">Ask a question…</span>
                <span aria-hidden="true" className="flex size-7 items-center justify-center rounded-pill bg-primary text-primary-fg">
                  ↑
                </span>
              </div>
              <p className="mt-2 text-center text-[11px] text-fg-subtle">Powered by {APP_NAME}</p>
            </div>
          </GlassPanel>

          <span
            aria-hidden="true"
            className="flex size-14 items-center justify-center rounded-pill bg-primary shadow-glow"
          >
            <Logo className="size-6 [&_.fill-fg]:fill-primary-fg [&_.fill-canvas]:fill-primary" />
          </span>
        </div>
      </Container>
    </section>
  );
}
