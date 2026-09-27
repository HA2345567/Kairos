import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";
import { AllocationDonut } from "../components/basket/detail/AllocationDonut";
import type { BasketToken } from "../lib/baskets-data";

// Mock ResizeObserver for Recharts in jsdom
global.ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

describe("AllocationDonut", () => {
  const mockTokens: BasketToken[] = [
    {
      symbol: "SOL",
      name: "Wrapped SOL",
      mint: "So11111111111111111111111111111111111111112",
      weightBps: 4000,
      icon: "/tokens/sol.png",
      priceUsd: 148.5,
      change24h: 4.8,
    },
    {
      symbol: "JUP",
      name: "Jupiter",
      mint: "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN",
      weightBps: 2500,
      icon: "/tokens/jup.png",
      priceUsd: 0.92,
      change24h: 3.1,
    },
    {
      symbol: "JTO",
      name: "Jito",
      mint: "jtojtomepa8beP8AuQc6eXt5FriJwfFMwQx2v2f9mCL",
      weightBps: 2000,
      icon: "/tokens/jto.png",
      priceUsd: 2.85,
      change24h: 6.2,
    },
    {
      symbol: "PYTH",
      name: "Pyth Network",
      mint: "HZ1JovNiDcZvKhVkW1dhPfDYDA422BX2UStnrD1182BQ",
      weightBps: 1500,
      icon: "/tokens/pyth.svg",
      priceUsd: 0.34,
      change24h: 2.4,
    },
  ];

  it("renders center TVL label formatted as currency", () => {
    render(<AllocationDonut tokens={mockTokens} tvlUsd={1425000} />);

    expect(screen.getByText("$1,425,000")).toBeDefined();
    expect(screen.getByText(/BASKET TVL/i)).toBeDefined();
  });

  it("renders legend with all constituent tokens and correct allocation percentages", () => {
    render(<AllocationDonut tokens={mockTokens} tvlUsd={1425000} />);

    expect(screen.getByText("SOL")).toBeDefined();
    expect(screen.getByText("40.0%")).toBeDefined();

    expect(screen.getByText("JUP")).toBeDefined();
    expect(screen.getByText("25.0%")).toBeDefined();

    expect(screen.getByText("JTO")).toBeDefined();
    expect(screen.getByText("20.0%")).toBeDefined();

    expect(screen.getByText("PYTH")).toBeDefined();
    expect(screen.getByText("15.0%")).toBeDefined();
  });
});
