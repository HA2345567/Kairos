import crypto from "node:crypto";
import { repository } from "../db/repository";
import { config } from "../config";
import { AppError } from "../errors";
import { getLivePrice, priceImpactPct } from "./pricing.service";
import { Quote, QuoteLeg } from "../db/schema";

/**
 * Quote service (PRD §4.3). Happy-path math is unchanged: platform fee on
 * input, integer-cent splitting by weight_bps with the remainder pushed to
 * the largest leg. Hardened with live prices, staleness + price-impact
 * guards, and market-hours handling for tokenized-equity legs.
 */

export class QuoteService {
  getQuote(basketSlug: string, usdcAmount: number): Quote {
    const basket = repository.getBasketBySlug(basketSlug);
    if (!basket) throw new AppError("BASKET_NOT_FOUND", `Basket ${basketSlug} not found`, 404);
    if (basket.status !== "active") throw new AppError("BASKET_NOT_ACTIVE", undefined, 422);
    if (usdcAmount < basket.minUsdc) {
      throw new AppError("MIN_INVESTMENT", `Minimum investment is ${basket.minUsdc} USDC`, 422);
    }

    const version = repository.getBasketVersion(basket.activeVersionId);
    if (!version) throw new AppError("BASKET_NOT_FOUND", "Active version not found", 404);
    const weightSum = version.legs.reduce((s, l) => s + l.weightBps, 0);
    if (version.legs.length === 0 || weightSum !== 10_000) {
      throw new AppError("WEIGHT_SUM_INVALID", `Version weights sum to ${weightSum}, expected 10000`, 422);
    }

    // 1. Platform fee on the input (never output-side too — PRD §4.4 rule 5).
    const platformFeeUsdc = Number(((usdcAmount * config.platformFeeBps) / 10000).toFixed(4));
    const netInvestUsdc = Number((usdcAmount - platformFeeUsdc).toFixed(4));

    // 2. Integer-cent allocation by weight; remainder to the largest leg.
    const netCents = Math.floor(netInvestUsdc * 100);
    const rawLegCents = version.legs.map((leg) => Math.floor((netCents * leg.weightBps) / 10000));
    const allocated = rawLegCents.reduce((s, c) => s + c, 0);
    let largestIdx = 0;
    let maxWeight = -1;
    version.legs.forEach((leg, idx) => {
      if (leg.weightBps > maxWeight) {
        maxWeight = leg.weightBps;
        largestIdx = idx;
      }
    });
    rawLegCents[largestIdx] += netCents - allocated;

    // 3. Per-leg live prices + guards (PRD §4.3).
    const legs: QuoteLeg[] = [];
    for (let idx = 0; idx < version.legs.length; idx++) {
      const leg = version.legs[idx];
      const token = repository.getToken(leg.mint);
      if (!token || token.denylisted) {
        throw new AppError("TOKEN_HALTED", `Leg ${leg.mint} is not tradable`, 422);
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

      const live = getLivePrice(leg.mint);
      if (live.stale) {
        throw new AppError("QUOTE_STALE", `${token.symbol} price feed is stale (${live.ageSec}s old)`, 409);
      }

      const legUsdc = rawLegCents[idx] / 100;
      const impactPct = priceImpactPct(legUsdc);
      if (impactPct > config.maxPriceImpactPct) {
        throw new AppError(
          "PRICE_IMPACT_EXCEEDED",
          `${token.symbol} leg impact ${impactPct.toFixed(2)}% exceeds cap ${config.maxPriceImpactPct}%`,
          422
        );
      }

      const decimals = Math.min(token.decimals, 6);
      const expectedTokens = (legUsdc / live.priceUsd).toFixed(decimals);
      const slippageBps = leg.slippageBps || 50;
      const minTokens = ((Number(expectedTokens) * (10000 - slippageBps)) / 10000).toFixed(decimals);

      legs.push({
        mint: leg.mint,
        symbol: token.symbol,
        weightBps: leg.weightBps,
        inUsdcAmount: legUsdc,
        expectedOutTokens: expectedTokens,
        minOutTokens: minTokens,
        priceImpactPct: `${impactPct.toFixed(3)}%`,
        routeHint: leg.venueHint || "Kairos Router",
      });
    }

    const now = new Date();
    const quote: Quote = {
      id: "quote-" + crypto.randomUUID().slice(0, 10),
      basketId: basket.id,
      basketVersionId: version.id,
      usdcAmount,
      legs,
      platformFeeUsdc,
      netInvestUsdc,
      expiresAt: new Date(now.getTime() + config.quoteValiditySec * 1000).toISOString(),
      createdAt: now.toISOString(),
    };
    return repository.saveQuote(quote);
  }
}

export const quoteService = new QuoteService();
