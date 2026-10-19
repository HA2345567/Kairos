import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { kairosApi } from "@/lib/api-client";

/**
 * FE-09: anonymized page-view analytics.
 *
 * Only the route path and a closed event name leave the browser; the API strips
 * identifiers and never stores an IP. Consent is a local preference (an opt-out
 * flag, not a token), and the default is on for devnet evaluation.
 */

export const ANALYTICS_OPT_OUT_KEY = "kairos.analytics.optOut";

export function analyticsEnabled(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(ANALYTICS_OPT_OUT_KEY) !== "1";
  } catch {
    return false;
  }
}

export function setAnalyticsEnabled(enabled: boolean): void {
  if (typeof window === "undefined") return;
  try {
    if (enabled) window.localStorage.removeItem(ANALYTICS_OPT_OUT_KEY);
    else window.localStorage.setItem(ANALYTICS_OPT_OUT_KEY, "1");
  } catch {
    /* storage unavailable — analytics simply stays off */
  }
}

function eventNameFor(pathname: string): string {
  if (pathname.startsWith("/basket") || pathname.startsWith("/market")) return "basket_view";
  if (pathname.startsWith("/portfolio") || pathname.startsWith("/positions")) return "position_view";
  if (pathname.startsWith("/settings")) return "settings_view";
  if (pathname.startsWith("/labs") || pathname.startsWith("/ideas")) return "labs_view";
  return "page_view";
}

export function usePageViews(): void {
  const { pathname } = useLocation();
  useEffect(() => {
    if (!analyticsEnabled()) return;
    void kairosApi.recordPageView(eventNameFor(pathname), pathname);
  }, [pathname]);
}
