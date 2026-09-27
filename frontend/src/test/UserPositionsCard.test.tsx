import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import React from "react";
import { UserPositionsCard } from "../components/basket/detail/UserPositionsCard";
import { CURATED_BASKETS } from "../lib/baskets-data";

// Mock wallet hooks
vi.mock("@solana/wallet-adapter-react", () => ({
  useWallet: () => ({ connected: false, publicKey: null }),
}));

vi.mock("@privy-io/react-auth", () => ({
  usePrivy: () => ({ authenticated: false }),
}));

describe("UserPositionsCard", () => {
  const mockBasket = CURATED_BASKETS[0];

  it("renders empty state with message and Invest Now button when no position exists", () => {
    const handleInvest = vi.fn();
    render(<UserPositionsCard basket={mockBasket} onInvestClick={handleInvest} />);

    expect(screen.getByText(/No open position/i)).toBeDefined();
    expect(
      screen.getByText(/Invest in this basket to view your live portfolio allocation and PnL/i)
    ).toBeDefined();

    const investBtn = screen.getByRole("button", { name: /Invest in Basket/i });
    fireEvent.click(investBtn);
    expect(handleInvest).toHaveBeenCalled();
  });

  it("allows switching between Positions and Activity sub-tabs", () => {
    render(<UserPositionsCard basket={mockBasket} onInvestClick={vi.fn()} />);

    const activityTab = screen.getByRole("button", { name: /Rebalance Activity/i });
    fireEvent.click(activityTab);
    expect(screen.getByText(/No recent rebalance activity for your wallet/i)).toBeDefined();
  });
});
