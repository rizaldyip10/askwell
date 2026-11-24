"use client";

import { useEffect } from "react";
import { mountLandingLoader } from "../../lib/landing/mount-loader";

/**
 * Runs the app's own widget on the landing page (§6.1), like on a customer's site.
 * The loader tag is added on mount rather than rendered in JSX: React doesn't run a `<script>`
 * it inserts on a client-side navigation, and the widget must go away when the visitor leaves `/`.
 * `widgetKey` comes from the server at request time; null renders nothing.
 */
export function LandingWidget({ appUrl, widgetKey }: { appUrl: string; widgetKey: string | null }) {
  useEffect(() => {
    if (!widgetKey) return;
    return mountLandingLoader(document, appUrl, widgetKey);
  }, [appUrl, widgetKey]);

  return null;
}
