import { Demo } from "../components/landing/demo";
import { Hero } from "../components/landing/hero";
import { HowItWorks } from "../components/landing/how-it-works";
import { Install } from "../components/landing/install";
import { Pricing } from "../components/landing/pricing";
import { RevealObserver } from "../components/landing/reveal-observer";
import { SiteFooter } from "../components/landing/site-footer";
import { SiteHeader } from "../components/landing/site-header";

export default function Home() {
  return (
    <div className="theme-dark min-h-screen overflow-x-clip bg-canvas text-fg">
      <SiteHeader />
      <main>
        <Hero />
        <HowItWorks />
        <Demo />
        <Pricing />
        <Install />
      </main>
      <SiteFooter />
      <RevealObserver />
    </div>
  );
}
