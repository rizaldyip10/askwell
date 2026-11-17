import { APP_NAME } from "@askwell/shared";
import { Badge } from "../ui/badge";
import { ButtonLink } from "../ui/button";
import { Container } from "../ui/container";
import { SIGN_UP_HREF, START_FREE_LABEL } from "./links";

export function Hero() {
  return (
    <section aria-labelledby="hero-title" className="relative overflow-hidden">
      {/* Soft glow behind the headline */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute top-[-12rem] left-1/2 size-[36rem] -translate-x-1/2 rounded-pill bg-glass-strong blur-glass-lg sm:size-[48rem]"
      />
      <Container className="relative flex flex-col items-center pt-20 pb-24 text-center sm:pt-28 sm:pb-32">
        <Badge className="motion-safe:animate-fade-up">AI support chat for any website</Badge>
        <h1
          id="hero-title"
          className="mt-6 max-w-3xl text-4xl font-semibold tracking-tight text-balance sm:text-6xl motion-safe:animate-fade-up motion-safe:[animation-delay:100ms]"
        >
          Answers for your visitors, from your own docs.
        </h1>
        <p className="mt-6 max-w-xl text-base text-pretty text-fg-muted sm:text-lg motion-safe:animate-fade-up motion-safe:[animation-delay:200ms]">
          {APP_NAME} reads your product docs and answers visitor questions in a chat widget. Paste
          one script tag and it&apos;s live.
        </p>
        <div className="mt-10 flex w-full flex-col items-center justify-center gap-3 sm:w-auto sm:flex-row motion-safe:animate-fade-up motion-safe:[animation-delay:300ms]">
          <ButtonLink href={SIGN_UP_HREF} size="lg" className="w-full sm:w-auto">
            {START_FREE_LABEL}
          </ButtonLink>
          <ButtonLink href="#demo" variant="secondary" size="lg" className="w-full sm:w-auto">
            See it answer
          </ButtonLink>
        </div>
        <p className="mt-4 text-sm text-fg-subtle motion-safe:animate-fade-up motion-safe:[animation-delay:400ms]">
          Free plan. No card needed.
        </p>
      </Container>
    </section>
  );
}
