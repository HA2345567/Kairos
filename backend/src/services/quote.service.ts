import crypto from "node:crypto";
import { repository } from "../db/repository";
import { config } from "../config";
import { AppError } from "../errors";
import { getQuotePrice } from "./pricing.service";
import { Quote, QuoteLeg } from "../db/schema";
import { allocateBaseUnits, baseUnitsToUsdc, usdcToBaseUnits, USDC_BASE_UNITS } from "./money";

/**
 * Quote service for fixed-rate devnet execution. Impact remains unavailable
 * until the execution route supplies a real pool quote.
 */

export class QuoteService {
  async getQuote(basketSlug: string, usdcAmount: number): Promise<Quote> {
    if (!Number.isFinite(usdcAmount) || usdcAmount <= 0 || usdcAmount > Number.MAX_SAFE_INTEGER / 1_000_000) {
      throw new AppError("MIN_INVESTMENT", "Enter a valid positive USDC amount", 400);
    }
    const basket = (await repository.getBasketBySlug(basketSlug));
    if (!basket) throw new AppError("BASKET_NOT_FOUND", `Basket ${basketSlug} not found`, 404);
    if (basket.status !== "active") {
      throw new AppError(
        "BASKET_NOT_ACTIVE",
        "This basket is paused because its Devnet assets are not initialized and funded.",
        422,
      );
    }
    if (usdcAmount < basket.minUsdc) {
      throw new AppError("MIN_INVESTMENT", `Minimum investment is ${basket.minUsdc} USDC`, 422);
    }

    const version = (await repository.getBasketVersion(basket.activeVersionId));
    if (!version) throw new AppError("BASKET_NOT_FOUND", "Active version not found", 404);
    const weightSum = version.legs.reduce((s, l) => s + l.weightBps, 0);
    if (version.legs.length === 0 || weightSum !== 10_000) {
      throw new AppError("WEIGHT_SUM_INVALID", `Version weights sum to ${weightSum}, expected 10000`, 422);
    }

    // 1. Platform fee on the input (never output-side too — PRD §4.4 rule 5).
    // Keep all USDC allocation in six-decimal base units until the response boundary.
    const usdcBaseUnits = usdcToBaseUnits(usdcAmount);
    const platformFeeBaseUnits = Math.floor((usdcBaseUnits * config.platformFeeBps) / 10000);
    const netInvestBaseUnits = usdcBaseUnits - platformFeeBaseUnits;
    const platformFeeUsdc = baseUnitsToUsdc(platformFeeBaseUnits);
    const netInvestUsdc = baseUnitsToUsdc(netInvestBaseUnits);

    // 2. Integer-base-unit allocation; remainder goes to the largest leg.
    const rawLegBaseUnits = allocateBaseUnits(
      netInvestBaseUnits,
      version.legs.map((leg) => leg.weightBps),
    );

    // 3. Per-leg price source and token eligibility (PRD §4.3).
    const legs: QuoteLeg[] = await Promise.all(version.legs.map(async (leg, idx) => {
      const token = await repository.getToken(leg.mint);
      if (!token || token.denylisted) {
        throw new AppError("TOKEN_HALTED", `Leg ${leg.mint} is not tradable`);
      }
      if (token.tradingStatus === "halted") {
        throw new AppError("TOKEN_HALTED", `${token.symbol} trading is halted`, 422);
      }
      if (
        token.isMarketHoursRestricted &&
        token.tradingStatus === "market_closed"
      ) {
        // PRD §4.3: tokenized-equity legs reject when the market is closed
        // (admin can toggle tradingStatus to simulate open markets).
        throw new AppError(
          "MARKET_CLOSED",
          `${token.symbol} is a tokenized equity and its market is closed — scheduled for market open`,
          422
        );
      }

      const live = await getQuotePrice(leg.mint, token);
      if (live.stale) {
        const reason = live.ageSec === null
          ? "verified price feed is unavailable"
          : `price feed is stale (${live.ageSec}s old)`;
        throw new AppError("PRICE_STALE", `${token.symbol} ${reason}`);
      }

      const legUsdc = rawLegBaseUnits[idx] / USDC_BASE_UNITS;
      const decimals = Math.min(token.decimals, 6);
      const expectedTokens = (legUsdc / live.priceUsd).toFixed(decimals);
      const slippageBps = leg.slippageBps || 50;
      const minTokens = ((Number(expectedTokens) * (10000 - slippageBps)) / 10000).toFixed(decimals);

      return {
        mint: leg.mint,
        symbol: token.symbol,
        weightBps: leg.weightBps,
        inUsdcAmount: legUsdc,
        expectedOutTokens: expectedTokens,
        minOutTokens: minTokens,
        priceImpactPct: null,
        priceSource: live.source,
        priceSourceRef: live.sourceRef ?? undefined,
        priceAsOf: live.ts,
        priceConfidenceUsd: live.confidenceUsd,
        routeHint: leg.venueHint || "Kairos Router",
      };
    }));

    const now = new Date();
    const quote: Quote = {
      id: "quote-" + crypto.randomUUID().slice(0, 10),
      basketId: basket.id,
      basketVersionId: version.id,
      usdcAmount,
      usdcBaseUnits: String(usdcBaseUnits),
      legs,
      platformFeeUsdc,
      platformFeeBaseUnits: String(platformFeeBaseUnits),
      netInvestUsdc,
      netInvestBaseUnits: String(netInvestBaseUnits),
      expiresAt: new Date(now.getTime() + config.quoteValiditySec * 1000).toISOString(),
      createdAt: now.toISOString(),
    };
    return (await repository.saveQuote(quote));
  }
}

export const quoteService = new QuoteService();
