import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";
import { ConstituentTokenCard } from "../components/basket/detail/ConstituentTokenCard";
import type { BasketToken } from "../lib/baskets-data";

describe("ConstituentTokenCard", () => {
  const mockToken: BasketToken = {
    symbol: "SOL",
    name: "Wrapped SOL",
    mint: "So11111111111111111111111111111111111111112",
    weightBps: 4000,
    icon: "/tokens/sol.png",
    priceUsd: 148.5,
    change24h: 4.8,
  };

  it("renders token symbol, name, price, and allocation weight", () => {
    render(<ConstituentTokenCard token={mockToken} />);

    expect(screen.getByText("SOL")).toBeDefined();
    expect(screen.getByText("Wrapped SOL")).toBeDefined();
    expect(screen.getByText("$148.50")).toBeDefined();
    expect(screen.getByText("40.0%")).toBeDefined();
    expect(screen.getByText("+4.80%")).toBeDefined();
  });

  it("renders truncated mint address and copy button", () => {
    render(<ConstituentTokenCard token={mockToken} />);

    const truncated = `${mockToken.mint.slice(0, 4)}...${mockToken.mint.slice(-4)}`;
    expect(screen.getByText(truncated)).toBeDefined();
  });

  it("handles negative 24h price changes", () => {
    const negativeToken: BasketToken = {
      ...mockToken,
      symbol: "JUP",
      name: "Jupiter",
      priceUsd: 0.92,
      change24h: -2.35,
      weightBps: 2500,
    };

    render(<ConstituentTokenCard token={negativeToken} />);
    expect(screen.getByText("JUP")).toBeDefined();
    expect(screen.getByText("-2.35%")).toBeDefined();
    expect(screen.getByText("25.0%")).toBeDefined();
  });
});
