import { connection } from "next/server";
import { Demo } from "../components/landing/demo";
import { Hero } from "../components/landing/hero";
import { HowItWorks } from "../components/landing/how-it-works";
import { Install } from "../components/landing/install";
import { Pricing } from "../components/landing/pricing";
import { RevealObserver } from "../components/landing/reveal-observer";
import { SiteFooter } from "../components/landing/site-footer";
import { SiteHeader } from "../components/landing/site-header";
import { appUrl } from "../lib/app-url";

// Rendered per request, not at build time: the install snippet's URL comes from `appUrl()`,
// and the landing widget's key (§11) is read at request time too. A missing
// NEXT_PUBLIC_APP_URL still fails loudly, on the request instead of the build.
export default async function Home() {
  await connection();
  const origin = appUrl();
  return (
    <div className="theme-dark min-h-screen overflow-x-clip bg-canvas text-fg">
      <SiteHeader />
      <main>
        <Hero />
        <HowItWorks />
        <Demo />
        <Pricing />
        <Install appUrl={origin} />
      </main>
      <SiteFooter />
      <RevealObserver />
    </div>
  );
}
