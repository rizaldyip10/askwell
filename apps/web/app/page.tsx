import { connection } from "next/server";
import { Demo } from "../components/landing/demo";
import { Hero } from "../components/landing/hero";
import { HowItWorks } from "../components/landing/how-it-works";
import { Install } from "../components/landing/install";
import { LandingWidget } from "../components/landing/landing-widget";
import { Pricing } from "../components/landing/pricing";
import { RevealObserver } from "../components/landing/reveal-observer";
import { SiteFooter } from "../components/landing/site-footer";
import { SiteHeader } from "../components/landing/site-header";
import { appUrl } from "../lib/app-url";
import { landingWidgetKey } from "../lib/landing/widget-key";

// Rendered per request, not at build time: the install snippet's URL comes from `appUrl()`,
// and the landing widget's key (§11) differs per environment. A missing
// NEXT_PUBLIC_APP_URL still fails loudly, on the request instead of the build.
// A missing LANDING_WIDGET_KEY just means no widget.
export default async function Home() {
  await connection();
  const origin = appUrl();
  const widgetKey = landingWidgetKey();
  return (
    <div className="theme-dark min-h-screen overflow-x-clip bg-canvas text-fg">
      <SiteHeader />
      <main>
        <Hero />
        <HowItWorks />
        <Demo liveWidget={widgetKey !== null} />
        <Pricing />
        <Install appUrl={origin} />
      </main>
      <SiteFooter />
      <RevealObserver />
      <LandingWidget appUrl={origin} widgetKey={widgetKey} />
    </div>
  );
}
