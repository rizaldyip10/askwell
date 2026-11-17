import Link from "next/link";
import { APP_NAME } from "@askwell/shared";
import { ButtonLink } from "../ui/button";
import { Container } from "../ui/container";
import { Logo } from "./logo";
import { SIGN_UP_HREF, START_FREE_LABEL } from "./links";

const NAV = [
  { href: "#how-it-works", label: "How it works" },
  { href: "#demo", label: "Demo" },
  { href: "#pricing", label: "Pricing" },
  { href: "#install", label: "Install" },
];

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-glass-line bg-canvas/60 backdrop-blur-glass">
      <Container className="flex h-16 items-center justify-between gap-4">
        <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
          <Logo />
          <span>{APP_NAME}</span>
        </Link>
        <nav aria-label="Main" className="hidden items-center gap-1 md:flex">
          {NAV.map((item) => (
            <a
              key={item.href}
              href={item.href}
              className="rounded-pill px-3 py-2 text-sm text-fg-muted transition-colors hover:text-fg"
            >
              {item.label}
            </a>
          ))}
        </nav>
        <ButtonLink href={SIGN_UP_HREF} size="md">
          {START_FREE_LABEL}
        </ButtonLink>
      </Container>
    </header>
  );
}
