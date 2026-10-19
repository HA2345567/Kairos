import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { lazy, Suspense } from "react";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SolanaProvider } from "@/components/wallet/SolanaProvider";

import NotFound from "./pages/NotFound.tsx";
import { usePageViews } from "./hooks/usePageViews";

const Landing = lazy(() => import("./pages/Index.tsx"));
const Markets = lazy(() => import("./pages/Markets.tsx"));
const MarketDetail = lazy(() => import("./pages/MarketDetailpage.tsx"));
const Portfolio = lazy(() => import("./pages/Portfolio.tsx"));
const AdminPage = lazy(() => import("./pages/Admin.tsx"));
const Labs = lazy(() => import("./pages/Labs.tsx"));
const LabsCreate = lazy(() => import("./pages/LabsCreate.tsx"));
const LabsIdeaDetail = lazy(() => import("./pages/LabsIdeaDetail.tsx"));
const LeaderboardPage = lazy(() => import("./pages/Leaderboard.tsx"));
const ExecutionStatusPage = lazy(() => import("./pages/ExecutionStatusPage.tsx"));
const PositionDetailPage = lazy(() => import("./pages/PositionDetailPage.tsx"));
const LegalPage = lazy(() => import("./pages/LegalPage.tsx"));
const SettingsPage = lazy(() => import("./pages/Settings.tsx"));
const DocsPage = lazy(() => import("./pages/DocsPage.tsx"));

/** FE-09: anonymized page views; must live inside the router. */
function AnalyticsListener() {
  usePageViews();
  return null;
}

const queryClient = new QueryClient({
  defaultOptions: { 
    queries: { 
      staleTime: 60_000, 
      gcTime: 1000 * 60 * 60 * 24, // 24 hours
      refetchOnWindowFocus: false, 
      retry: 1 
    } 
  },
});

const App = () => (
  <QueryClientProvider client={queryClient}>
    <SolanaProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <AnalyticsListener />
          <Suspense
            fallback={
              <div className="app-loading" role="status" aria-live="polite">
                <img className="app-loading__logo" src="/kairos-logo-white.png" alt="" />
                <span className="app-loading__spinner" aria-hidden="true" />
              </div>
            }
          >
            <Routes>
              <Route path="/" element={<Landing />} />
              <Route path="/markets" element={<Markets />} />
              <Route path="/market" element={<Markets />} />
              <Route path="/markets/create" element={<LabsCreate />} />
              <Route path="/markets/:id" element={<MarketDetail />} />
              <Route path="/product/:id" element={<MarketDetail />} />
              <Route path="/baskets" element={<Markets />} />
              <Route path="/baskets/create" element={<LabsCreate />} />
              <Route path="/create" element={<LabsCreate />} />
              <Route path="/basket/:id" element={<MarketDetail />} />
              <Route path="/positions" element={<Portfolio />} />
              <Route path="/positions/:id" element={<PositionDetailPage />} />
              <Route path="/executions/:id" element={<ExecutionStatusPage />} />
              <Route path="/settings" element={<SettingsPage />} />
              <Route path="/terms" element={<LegalPage />} />
              <Route path="/privacy" element={<LegalPage />} />
              <Route path="/ideas" element={<Labs />} />
              <Route path="/ideas/create" element={<LabsCreate />} />
              <Route path="/labs" element={<Labs />} />
              <Route path="/labs/create" element={<LabsCreate />} />
              <Route path="/labs/:marketId" element={<LabsIdeaDetail />} />
              <Route path="/portfolio" element={<Portfolio />} />
              <Route path="/admin" element={<AdminPage />} />
              <Route path="/docs" element={<DocsPage />} />
              <Route path="/ideas/leaderboard" element={<LeaderboardPage />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </Suspense>
        </BrowserRouter>
      </TooltipProvider>
    </SolanaProvider>
  </QueryClientProvider>
);

export default App;
