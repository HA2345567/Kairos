/** Temporary repro for the publish-v2 FOREIGN KEY failure. */
import { adminService } from "../src/services/admin.service";
import { repository } from "../src/db/repository";

const basket = repository.getBasketBySlug("solana-infra-governance")!;
console.log("activeVersion:", basket.activeVersionId);
const version = repository.getBasketVersion(basket.activeVersionId!)!;
try {
  const v = adminService.publishBasketVersion("solana-infra-governance", {
    version: 98,
    changelog: "repro",
    publishedBy: "admin",
    legs: version.legs.map((l, i) => ({
      id: `leg-98-${i}`,
      versionId: "",
      mint: l.mint,
      weightBps: l.weightBps,
      legType: l.legType ?? "spl",
      venueHint: l.venueHint,
      slippageBps: l.slippageBps,
    })),
  } as never);
  console.log("PUBLISHED OK:", v.id);
} catch (e) {
  console.error("PUBLISH FAILED:", (e as Error).message);
  console.error((e as Error).stack?.split("\n").slice(0, 10).join("\n"));
}
