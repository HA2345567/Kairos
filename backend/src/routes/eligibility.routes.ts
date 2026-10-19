import { KairosHttpServer } from "../server";
import { authService } from "../services/auth.service";
import { eligibilityService } from "../services/eligibility.service";
import { geoCheck, rateLimit } from "../middleware";
import { AppError } from "../errors";

/**
 * /v1/eligibility — FR-04 account eligibility and the §13.1 age attestation.
 *
 * The region gate runs before this (middleware.geoCheck answers REGION_BLOCKED
 * without any downstream call). This route exposes the account-level state so
 * the Settings page can show it and the user can record the 18+ attestation.
 */
export function registerEligibilityRoutes(app: KairosHttpServer): void {
  const guard = rateLimit("eligibility", { max: 60, windowMs: 60_000 });

  app.get("/v1/eligibility", async (req, reply) => {
    if (!guard(req, reply)) return;
    const auth = authService.requireAuth(req);
    if (!auth?.walletAddress) return reply.status(401).send({ error: "UNAUTHORIZED" });
    const eligibility = await eligibilityService.getEligibility(auth.walletAddress);
    if (!eligibility) return reply.status(404).send({ error: "WALLET_NOT_REGISTERED" });
    return { eligibility };
  });

  app.post("/v1/eligibility/confirm", async (req, reply) => {
    if (!geoCheck(req, reply)) return;
    if (!guard(req, reply)) return;
    const auth = authService.requireAuth(req);
    if (!auth?.walletAddress) return reply.status(401).send({ error: "UNAUTHORIZED" });
    const { ageConfirmed, region } = (req.body || {}) as { ageConfirmed?: boolean; region?: string };
    if (ageConfirmed !== true) {
      return reply.status(400).send({ error: "ELIGIBILITY_REQUIRED", message: "An 18+ attestation is required" });
    }
    try {
      const eligibility = await eligibilityService.confirmEligibility(auth.walletAddress, {
        ageConfirmed: true,
        region,
      });
      if (!eligibility) return reply.status(404).send({ error: "WALLET_NOT_REGISTERED" });
      return { eligibility };
    } catch (err) {
      throw AppError.from(err);
    }
  });
}
