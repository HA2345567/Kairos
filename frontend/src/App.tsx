import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { lazy, Suspense } from "react";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SolanaProvider } from "@/components/wallet/SolanaProvider";

import NotFound from "./pages/NotFound.tsx";

const Landing = lazy(() => import("./pages/Index.tsx"));
const Markets = lazy(() => import("./pages/Markets.tsx"));
const MarketDetail = lazy(() => import("./pages/MarketDetailpage.tsx"));
const Portfolio = lazy(() => import("./pages/Portfolio.tsx"));
const AdminPage = lazy(() => import("./pages/Admin.tsx"));
const Labs = lazy(() => import("./pages/Labs.tsx"));
const LabsCreate = lazy(() => import("./pages/LabsCreate.tsx"));

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
          <Suspense fallback={null}>
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
              <Route path="/ideas" element={<Labs />} />
              <Route path="/ideas/create" element={<LabsCreate />} />
              <Route path="/labs" element={<Labs />} />
              <Route path="/labs/create" element={<LabsCreate />} />
              <Route path="/portfolio" element={<Portfolio />} />
              <Route path="/admin" element={<AdminPage />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </Suspense>
        </BrowserRouter>
      </TooltipProvider>
    </SolanaProvider>
  </QueryClientProvider>
);

export default App;
