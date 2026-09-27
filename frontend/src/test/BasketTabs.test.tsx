import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import React from "react";
import { BasketTabs, type DetailTabType } from "../components/basket/detail/BasketTabs";
import { StrategyRationale } from "../components/basket/detail/StrategyRationale";
import { HistoricalTabView } from "../components/basket/detail/HistoricalTabView";
import { RebalancesTabView } from "../components/basket/detail/RebalancesTabView";
import { RiskTabView } from "../components/basket/detail/RiskTabView";
import { ResourcesTabView } from "../components/basket/detail/ResourcesTabView";
import { CURATED_BASKETS } from "../lib/baskets-data";

describe("BasketTabs & Tab Views", () => {
  const mockBasket = CURATED_BASKETS[0];

  it("renders all 5 tabs and calls onTabChange when clicked", () => {
    const handleTabChange = vi.fn();
    render(<BasketTabs activeTab="About" onTabChange={handleTabChange} />);

    const tabs: DetailTabType[] = ["About", "Historical", "Rebalances", "Risk", "Resources"];
    tabs.forEach((tab) => {
      expect(screen.getByRole("button", { name: new RegExp(tab, "i") })).toBeDefined();
    });

    fireEvent.click(screen.getByRole("button", { name: /Historical/i }));
    expect(handleTabChange).toHaveBeenCalledWith("Historical");
  });

  it("renders StrategyRationale with narrative thesis and non-custodial Jupiter CPI routing note", () => {
    render(<StrategyRationale basket={mockBasket} />);
    expect(screen.getByText(/Investment Strategy & Narrative/i)).toBeDefined();
    expect(screen.getByText(/Non-Custodial Router Architecture/i)).toBeDefined();
  });

  it("renders HistoricalTabView with risk metrics table and drawdowns", () => {
    render(<HistoricalTabView basket={mockBasket} />);
    expect(screen.getByText(/Sharpe Ratio/i)).toBeDefined();
    expect(screen.getByText(/Max Drawdown/i)).toBeDefined();
  });

  it("renders RebalancesTabView with chronological rebalance events", () => {
    render(<RebalancesTabView basket={mockBasket} />);
    expect(screen.getByText(/Rebalance & Weight History/i)).toBeDefined();
    expect(screen.getByText(/Target Weight Adjustment/i)).toBeDefined();
  });

  it("renders RiskTabView with 4 risk cards", () => {
    render(<RiskTabView basket={mockBasket} />);
    expect(screen.getByText(/Smart Contract & Execution/i)).toBeDefined();
    expect(screen.getByText(/Liquidity & Slippage Profile/i)).toBeDefined();
  });

  it("renders ResourcesTabView with verified mints and Pyth feeds", () => {
    render(<ResourcesTabView basket={mockBasket} />);
    expect(screen.getByText(/Verified SPL Mint Addresses/i)).toBeDefined();
    expect(screen.getByText(/Oracle & Infrastructure References/i)).toBeDefined();
  });
});
