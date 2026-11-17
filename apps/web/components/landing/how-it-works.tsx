import { Container } from "../ui/container";
import { GlassPanel } from "../ui/glass-panel";
import { SectionHeading } from "../ui/section-heading";

const STEPS = [
  {
    title: "Add your knowledge",
    body: "Upload a PDF or paste text about your product. That's what the bot answers from.",
  },
  {
    title: "Paste one script tag",
    body: "Copy the snippet from Install and drop it into any page. The chat button appears.",
  },
  {
    title: "Visitors get answers",
    body: "Questions are answered right away. Read every conversation in your dashboard.",
  },
] as const;

export function HowItWorks() {
  return (
    <section id="how-it-works" aria-labelledby="how-title" className="scroll-mt-20 py-20 sm:py-28">
      <Container>
        <div data-reveal>
          <SectionHeading id="how-title" eyebrow="How it works" title="Live in three steps" />
        </div>
        <ol className="mt-12 grid gap-4 md:grid-cols-3">
          {STEPS.map((step, i) => (
            <li key={step.title} data-reveal style={{ transitionDelay: `${i * 100}ms` }}>
              <GlassPanel className="h-full p-6">
                <span className="flex size-9 items-center justify-center rounded-pill border border-glass-line font-mono text-sm text-fg-muted">
                  {i + 1}
                </span>
                <h3 className="mt-5 text-lg font-semibold">{step.title}</h3>
                <p className="mt-2 text-fg-muted">{step.body}</p>
              </GlassPanel>
            </li>
          ))}
        </ol>
      </Container>
    </section>
  );
}
