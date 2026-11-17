import { Badge } from "../ui/badge";
import { ButtonLink } from "../ui/button";
import { cn } from "../ui/cn";
import { Container } from "../ui/container";
import { GlassPanel } from "../ui/glass-panel";
import { SectionHeading } from "../ui/section-heading";
import { SIGN_UP_HREF, START_FREE_LABEL } from "./links";
import { PLANS, PLAN_LIMITS, type Plan } from "./plan-limits.mock";
import { PRICING_ROWS } from "./pricing-rows";

const PLAN_COPY: Record<Plan, { name: string; tagline: string; cta: string }> = {
  free: { name: "Free", tagline: "For trying it on one site.", cta: START_FREE_LABEL },
  pro: { name: "Pro", tagline: "For more sites, more chats and your own look.", cta: "Start free, upgrade later" },
};

export function Pricing() {
  return (
    <section id="pricing" aria-labelledby="pricing-title" className="scroll-mt-20 py-20 sm:py-28">
      <Container>
        <div data-reveal>
          <SectionHeading
            id="pricing-title"
            eyebrow="Pricing"
            title="Start free. Upgrade when you grow."
            description="Every account starts on Free. Upgrade to Pro from your dashboard."
          />
        </div>

        <div className="mx-auto mt-12 grid max-w-4xl gap-4 md:grid-cols-2">
          {PLANS.map((plan, i) => {
            const limits = PLAN_LIMITS[plan];
            const copy = PLAN_COPY[plan];
            const featured = plan === "pro";
            return (
              <div key={plan} data-reveal style={{ transitionDelay: `${i * 100}ms` }}>
                <GlassPanel
                  strong={featured}
                  className={cn("flex h-full flex-col p-6 sm:p-8", featured && "shadow-glow")}
                  data-plan={plan}
                >
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-xl font-semibold">{copy.name}</h3>
                    {featured ? <Badge variant="solid">Most flexible</Badge> : null}
                  </div>
                  <p className="mt-2 text-sm text-fg-muted">{copy.tagline}</p>

                  <dl className="mt-6 flex-1 divide-y divide-glass-line border-t border-glass-line">
                    {PRICING_ROWS.map((row) => (
                      <div key={row.label} className="flex items-baseline justify-between gap-4 py-3 text-sm">
                        <dt className="text-fg-muted">{row.label}</dt>
                        <dd className="shrink-0 text-right font-medium">{row.value(limits)}</dd>
                      </div>
                    ))}
                  </dl>

                  <ButtonLink
                    href={SIGN_UP_HREF}
                    variant={featured ? "primary" : "secondary"}
                    size="lg"
                    className="mt-8 w-full"
                  >
                    {copy.cta}
                  </ButtonLink>
                </GlassPanel>
              </div>
            );
          })}
        </div>
      </Container>
    </section>
  );
}
