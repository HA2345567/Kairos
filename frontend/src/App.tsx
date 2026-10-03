import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SolanaProvider } from "@/components/wallet/SolanaProvider";

import Landing from "./pages/Index.tsx";
import Markets from "./pages/Markets.tsx";
import MarketDetail from "./pages/MarketDetailpage.tsx";
import CreateBasket from "./pages/CreateBasket.tsx";
import Portfolio from "./pages/Portfolio.tsx";
import AdminPage from "./pages/Admin.tsx";
import NotFound from "./pages/NotFound.tsx";
import Labs from "./pages/Labs.tsx";
import LabsCreate from "./pages/LabsCreate.tsx";

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
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/markets" element={<Markets />} />
            <Route path="/markets/create" element={<CreateBasket />} />
            <Route path="/markets/:id" element={<MarketDetail />} />
            <Route path="/product/:id" element={<MarketDetail />} />
            <Route path="/baskets" element={<Markets />} />
            <Route path="/baskets/create" element={<CreateBasket />} />
            <Route path="/create" element={<CreateBasket />} />
            <Route path="/basket/:id" element={<MarketDetail />} />
            <Route path="/positions" element={<Portfolio />} />
            <Route path="/labs" element={<Labs />} />
            <Route path="/labs/create" element={<LabsCreate />} />
            <Route path="/portfolio" element={<Portfolio />} />
            <Route path="/admin" element={<AdminPage />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </SolanaProvider>
  </QueryClientProvider>
);

export default App;
