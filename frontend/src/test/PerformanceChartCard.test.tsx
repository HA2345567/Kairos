import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import React from "react";
import { PerformanceChartCard } from "../components/basket/detail/PerformanceChartCard";
import { CURATED_BASKETS } from "../lib/baskets-data";

// Mock ResizeObserver for Recharts ResponsiveContainer in jsdom
global.ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

describe("PerformanceChartCard", () => {
  const mockBasket = CURATED_BASKETS[0]; // solana-core

  it("renders chart header, title, and Alpha vs SOL badge", () => {
    render(<PerformanceChartCard basket={mockBasket} />);

    expect(screen.getByText(/Backtested & Historical Performance/i)).toBeDefined();
    expect(screen.getByText(/Alpha vs SOL/i)).toBeDefined();
  });

  it("renders all timeframe selector buttons and allows switching", () => {
    render(<PerformanceChartCard basket={mockBasket} />);

    const timeframes = ["1W", "1M", "6M", "1Y", "ALL"];
    timeframes.forEach((tf) => {
      const btn = screen.getByRole("button", { name: tf });
      expect(btn).toBeDefined();
    });

    const oneMonthBtn = screen.getByRole("button", { name: "1M" });
    fireEvent.click(oneMonthBtn);
    expect(oneMonthBtn.className).toContain("bg-[#D4FF00]");
  });

  it("renders dual-series legend indicators for Basket and SOL benchmark", () => {
    render(<PerformanceChartCard basket={mockBasket} />);

    expect(screen.getByText(/Basket Performance/i)).toBeDefined();
    expect(screen.getByText(/SOL Benchmark/i)).toBeDefined();
  });

  it("renders normalized index footnote disclaimer", () => {
    render(<PerformanceChartCard basket={mockBasket} />);

    expect(
      screen.getByText(/Simulated backtested and index values are normalized to base 100/i)
    ).toBeDefined();
  });
});
