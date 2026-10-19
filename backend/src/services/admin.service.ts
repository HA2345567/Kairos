import { randomUUID } from "node:crypto";
import { repository } from "../db/repository";
import { Basket, BasketPublishProposal, BasketVersion, BasketVersionDraft } from "../db/schema";
import { config } from "../config";

export class AdminService {
  async setGlobalKillSwitch(active: boolean, reason: string): Promise<boolean> {
    // Persisted setting is the source of truth for prepare/submit checks;
    // config.killSwitchActive kept in sync for any legacy readers.
    (await repository.setSetting("global_kill_switch", active ? "true" : "false"));
    config.killSwitchActive = active;
    (await repository.logAudit({
      actor: "admin",
      action: active ? "ENGAGE_GLOBAL_KILL_SWITCH" : "DISENGAGE_GLOBAL_KILL_SWITCH",
      entity: "system",
      entityId: "global",
      after: { active, reason },
    }));
    return config.killSwitchActive;
  }

  async toggleBasketStatus(slug: string, status: "active" | "paused" | "deprecated") {
    const basket = (await repository.getBasketBySlug(slug));
    if (!basket) throw new Error("BASKET_NOT_FOUND");
    const prev = basket.status;
    basket.status = status;
    (await repository.saveBasket(basket));
    (await repository.logAudit({
      actor: "admin",
      action: "UPDATE_BASKET_STATUS",
      entity: "basket",
      entityId: basket.id,
      before: { status: prev },
      after: { status },
    }));
    return basket;
  }

  /** Simulate market close / reopen for a token (PRD §4.3 market-hours path, §11.3 chaos). */
  async setTokenTradingStatus(mint: string, tradingStatus: "active" | "halted" | "market_closed") {
    const token = (await repository.getToken(mint));
    if (!token) throw new Error("TOKEN_NOT_FOUND");
    const prev = token.tradingStatus;
    token.tradingStatus = tradingStatus;
    (await repository.saveToken(token));
    (await repository.logAudit({
      actor: "admin",
      action: "UPDATE_TOKEN_TRADING_STATUS",
      entity: "token",
      entityId: mint,
      before: { tradingStatus: prev },
      after: { tradingStatus },
    }));
    return token;
  }

  private async buildBasketVersion(
    basketSlug: string,
    versionData: BasketVersionDraft
  ): Promise<{ basket: Basket; version: BasketVersion }> {
    const basket = (await repository.getBasketBySlug(basketSlug));
    if (!basket) throw new Error("BASKET_NOT_FOUND");

    if (!Number.isInteger(versionData.version) || versionData.version < 1 || versionData.version > 0xffff_ffff) {
      throw new Error("INVALID_BASKET_VERSION");
    }
    const currentVersion = (await repository.getVersionsForBasket(basket.id))[0]?.version ?? 0;
    if (versionData.version !== currentVersion + 1) {
      throw new Error(`BASKET_VERSION_MUST_BE_NEXT: Expected ${currentVersion + 1}`);
    }
    if (versionData.legs.length < 1 || versionData.legs.length > 12) {
      throw new Error("INVALID_BASKET_LEG_COUNT: Must contain 1 to 12 legs");
    }
    if (versionData.legs.some((leg) => !Number.isInteger(leg.weightBps) || leg.weightBps < 1 || leg.weightBps > 10_000)) {
      throw new Error("INVALID_WEIGHT_BPS: Each leg must be 1 to 10,000 integer basis points");
    }
    if (new Set(versionData.legs.map((leg) => leg.mint)).size !== versionData.legs.length) {
      throw new Error("DUPLICATE_BASKET_MINT");
    }

    // Enforce SUM(weightBps) = 10000
    const totalWeight = versionData.legs.reduce((acc, leg) => acc + leg.weightBps, 0);
    if (totalWeight !== 10000) {
      throw new Error(`INVALID_BASKET_WEIGHTS: Sum is ${totalWeight}, must be exactly 10,000 basis points`);
    }

    for (const leg of versionData.legs) {
      const token = (await repository.getToken(leg.mint));
      if (!token || token.denylisted || !Number.isFinite(token.priceUsd) || token.priceUsd <= 0) {
        throw new Error(`TOKEN_NOT_ELIGIBLE: ${leg.mint}`);
      }
      if (token.tradingStatus !== "active") {
        throw new Error(`TOKEN_NOT_TRADABLE: ${leg.mint}`);
      }
      // FR-03: publish requires liquidity evidence once a threshold is set.
      if (config.minLiquidityUsd > 0) {
        if (token.liquidityUsd === null || token.liquidityUsd === undefined) {
          throw new Error(`TOKEN_LIQUIDITY_UNVERIFIED: ${leg.mint}`);
        }
        if (token.liquidityUsd < config.minLiquidityUsd) {
          throw new Error(`TOKEN_ILLIQUID: ${leg.mint} has ${token.liquidityUsd} USD < ${config.minLiquidityUsd}`);
        }
      }
    }

    const version: BasketVersion = {
      ...versionData,
      id: `ver-${basket.slug}-v${versionData.version}`,
      basketId: basket.id,
      publishedAt: new Date().toISOString(),
      legs: versionData.legs.map((leg, index) => ({
        ...leg,
        id: leg.id || `leg-${versionData.version}-${index}`,
        versionId: `ver-${basket.slug}-v${versionData.version}`,
      })),
    };
    return { basket, version };
  }

  async proposeBasketVersion(
    basketSlug: string,
    versionData: BasketVersionDraft
  ): Promise<BasketPublishProposal> {
    const { version } = (await this.buildBasketVersion(basketSlug, versionData));
    const storedVersion: BasketVersionDraft = {
      version: version.version,
      changelog: version.changelog,
      publishedBy: version.publishedBy,
      legs: version.legs.map(({ id, mint, weightBps, legType, venueHint, slippageBps }) => ({
        id, mint, weightBps, legType, venueHint, slippageBps,
      })),
    };
    const proposal: BasketPublishProposal = {
      id: randomUUID(),
      basketSlug,
      proposedBy: version.publishedBy,
      createdAt: new Date().toISOString(),
      versionData: storedVersion,
      status: "pending",
    };
    (await repository.createBasketPublishProposal(proposal));
    (await repository.logAudit({
      actor: proposal.proposedBy,
      action: "PROPOSE_BASKET_VERSION",
      entity: "basket_publish_proposal",
      entityId: proposal.id,
      after: { version: version.version, changelog: version.changelog },
    }));
    return proposal;
  }

  async prepareBasketPublishTransaction(id: string, proposer: string) {
    const proposal = (await repository.getBasketPublishProposal(id));
    if (!proposal) throw new Error("PUBLISH_PROPOSAL_NOT_FOUND");
    if (proposal.status !== "pending") throw new Error("PUBLISH_PROPOSAL_NOT_PENDING");
    if (proposal.proposedBy !== proposer) throw new Error("PUBLISH_PROPOSER_MISMATCH");
    const { basket, version } = (await this.buildBasketVersion(proposal.basketSlug, proposal.versionData));
    return { proposal, basket, version };
  }

  async prepareBasketPublishApproval(id: string, approver: string) {
    const proposal = (await repository.getBasketPublishProposal(id));
    if (!proposal) throw new Error("PUBLISH_PROPOSAL_NOT_FOUND");
    if (proposal.status !== "pending") throw new Error("PUBLISH_PROPOSAL_NOT_PENDING");
    if (proposal.proposedBy === approver) throw new Error("PUBLISH_APPROVER_MUST_DIFFER");

    const { basket, version } = (await this.buildBasketVersion(proposal.basketSlug, {
      ...proposal.versionData,
      publishedBy: proposal.proposedBy,
    }));
    return { proposal, basket, version };
  }

  async approveBasketPublishProposal(
    id: string,
    approver: string,
    note: string,
    registryTx: string,
    legsHash: string
  ) {
    const { proposal, basket, version } = (await this.prepareBasketPublishApproval(id, approver));
    const publishedVersion = { ...version, registryTx, legsHash };
    const approved = (await repository.approveBasketPublishProposal(
      id,
      approver,
      new Date().toISOString(),
      note,
      publishedVersion,
      { ...basket, activeVersionId: publishedVersion.id },
      registryTx,
      legsHash
    ));
    (await repository.logAudit({
      actor: approver,
      action: "APPROVE_BASKET_PUBLISH",
      entity: "basket_version",
      entityId: publishedVersion.id,
      after: { proposalId: id, note },
    }));
    return { proposal: approved, version: publishedVersion, basketId: basket.id };
  }
}

export const adminService = new AdminService();
