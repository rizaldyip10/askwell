import Link from "next/link";
import { APP_NAME } from "@askwell/shared";
import { ButtonLink } from "../ui/button";
import { Container } from "../ui/container";
import { GlassPanel } from "../ui/glass-panel";
import { SIGN_UP_HREF, START_FREE_LABEL } from "./links";
import { Logo } from "./logo";

export function SiteFooter() {
  return (
    <footer className="pt-8 pb-10">
      <Container>
        <GlassPanel data-reveal className="flex flex-col items-center gap-6 px-6 py-12 text-center">
          <h2 className="text-2xl font-semibold tracking-tight text-balance sm:text-3xl">
            Put {APP_NAME} on your site today.
          </h2>
          <ButtonLink href={SIGN_UP_HREF} size="lg">
            {START_FREE_LABEL}
          </ButtonLink>
        </GlassPanel>

        <div className="mt-10 flex flex-col items-center justify-between gap-4 border-t border-line pt-6 text-sm text-fg-subtle sm:flex-row">
          <Link href="/" className="flex items-center gap-2 text-fg">
            <Logo className="size-5" />
            <span className="font-medium">{APP_NAME}</span>
          </Link>
          <nav aria-label="Footer" className="flex flex-wrap justify-center gap-x-5 gap-y-2">
            <a href="#how-it-works" className="hover:text-fg">How it works</a>
            <a href="#pricing" className="hover:text-fg">Pricing</a>
            <a href="#install" className="hover:text-fg">Install</a>
          </nav>
          <p>
            © {new Date().getFullYear()} {APP_NAME}
          </p>
        </div>
      </Container>
    </footer>
  );
}
