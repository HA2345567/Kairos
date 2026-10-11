import { repository } from "../db/repository";
import { BasketVersion } from "../db/schema";
import { config } from "../config";

export class AdminService {
  setGlobalKillSwitch(active: boolean, reason: string): boolean {
    // Persisted setting is the source of truth for prepare/submit checks;
    // config.killSwitchActive kept in sync for any legacy readers.
    repository.setSetting("global_kill_switch", active ? "true" : "false");
    config.killSwitchActive = active;
    repository.logAudit({
      actor: "admin",
      action: active ? "ENGAGE_GLOBAL_KILL_SWITCH" : "DISENGAGE_GLOBAL_KILL_SWITCH",
      entity: "system",
      entityId: "global",
      after: { active, reason },
    });
    return config.killSwitchActive;
  }

  toggleBasketStatus(slug: string, status: "active" | "paused" | "deprecated") {
    const basket = repository.getBasketBySlug(slug);
    if (!basket) throw new Error("BASKET_NOT_FOUND");
    const prev = basket.status;
    basket.status = status;
    repository.saveBasket(basket);
    repository.logAudit({
      actor: "admin",
      action: "UPDATE_BASKET_STATUS",
      entity: "basket",
      entityId: basket.id,
      before: { status: prev },
      after: { status },
    });
    return basket;
  }

  /** Simulate market close / reopen for a token (PRD §4.3 market-hours path, §11.3 chaos). */
  setTokenTradingStatus(mint: string, tradingStatus: "active" | "halted" | "market_closed") {
    const token = repository.getToken(mint);
    if (!token) throw new Error("TOKEN_NOT_FOUND");
    const prev = token.tradingStatus;
    token.tradingStatus = tradingStatus;
    repository.saveToken(token);
    repository.logAudit({
      actor: "admin",
      action: "UPDATE_TOKEN_TRADING_STATUS",
      entity: "token",
      entityId: mint,
      before: { tradingStatus: prev },
      after: { tradingStatus },
    });
    return token;
  }

  publishBasketVersion(basketSlug: string, versionData: Omit<BasketVersion, "id" | "publishedAt">): BasketVersion {
    const basket = repository.getBasketBySlug(basketSlug);
    if (!basket) throw new Error("BASKET_NOT_FOUND");

    // Enforce SUM(weightBps) = 10000
    const totalWeight = versionData.legs.reduce((acc, leg) => acc + leg.weightBps, 0);
    if (totalWeight !== 10000) {
      throw new Error(`INVALID_BASKET_WEIGHTS: Sum is ${totalWeight}, must be exactly 10,000 basis points`);
    }

    const version: BasketVersion = {
      ...versionData,
      id: `ver-${basket.slug}-v${versionData.version}`,
      basketId: basket.id,
      publishedAt: new Date().toISOString(),
    };

    repository.saveBasketVersion(version);
    basket.activeVersionId = version.id;
    repository.saveBasket(basket);

    repository.logAudit({
      actor: version.publishedBy,
      action: "PUBLISH_BASKET_VERSION",
      entity: "basket_version",
      entityId: version.id,
      after: { version: version.version, changelog: version.changelog },
    });

    return version;
  }
}

export const adminService = new AdminService();
