import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import React from "react";
import { InvestSidebar } from "../components/basket/detail/InvestSidebar";
import { CURATED_BASKETS } from "../lib/baskets-data";

// Mock wallet hooks for unit testing
vi.mock("@solana/wallet-adapter-react", () => ({
  useWallet: () => ({ connected: false, publicKey: null }),
  useConnection: () => ({ connection: {} }),
}));

vi.mock("@privy-io/react-auth", () => ({
  usePrivy: () => ({ authenticated: false, login: vi.fn() }),
}));

vi.mock("@solana/wallet-adapter-react-ui", () => ({
  useWalletModal: () => ({ setVisible: vi.fn() }),
}));

describe("InvestSidebar", () => {
  const mockBasket = CURATED_BASKETS[0]; // solana-core (SOL 40%, JUP 25%, JTO 20%, PYTH 15%)

  it("renders Invest header, non-custodial badge, and preset buttons", () => {
    const handleInvest = vi.fn();
    render(<InvestSidebar basket={mockBasket} onInvest={handleInvest} />);

    expect(screen.getByText("Invest Now")).toBeDefined();
    expect(screen.getByText(/Non-Custodial/i)).toBeDefined();

    // Check presets
    expect(screen.getByText("$25")).toBeDefined();
    expect(screen.getByText("$50")).toBeDefined();
    expect(screen.getByText("$100")).toBeDefined();
    expect(screen.getByText("$250")).toBeDefined();
  });

  it("updates constituent breakdown dynamically when preset or input changes", () => {
    const handleInvest = vi.fn();
    render(<InvestSidebar basket={mockBasket} onInvest={handleInvest} />);

    // Click $100 preset
    fireEvent.click(screen.getByText("$100"));

    // SOL is 40% -> $40.00
    expect(screen.getByText("$40.00")).toBeDefined();
    // JUP is 25% -> $25.00
    expect(screen.getByText("$25.00")).toBeDefined();
    // JTO is 20% -> $20.00
    expect(screen.getByText("$20.00")).toBeDefined();
    // PYTH is 15% -> $15.00
    expect(screen.getByText("$15.00")).toBeDefined();
  });

  it("calls onInvest with the current amount when CTA button is clicked", () => {
    const handleInvest = vi.fn();
    render(<InvestSidebar basket={mockBasket} onInvest={handleInvest} />);

    fireEvent.click(screen.getByText("$50"));
    const investBtn = screen.getByRole("button", { name: /Invest \$50/i });
    fireEvent.click(investBtn);

    expect(handleInvest).toHaveBeenCalledWith("50");
  });

  it("renders zero-custody security reassurance text", () => {
    const handleInvest = vi.fn();
    render(<InvestSidebar basket={mockBasket} onInvest={handleInvest} />);

    expect(
      screen.getByText(/Zero custody · Tokens land directly in your wallet ATAs/i)
    ).toBeDefined();
  });
});
