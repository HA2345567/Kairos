import { randomUUID } from "node:crypto";
import { repository } from "../db/repository";
import { AppError } from "../errors";
import type { LabsBasket } from "../db/schema";

/**
 * FR-25 Labs / UGC basket creation, community voting and moderation.
 *
 * The PRD ("Could") requires allocations to sum to 100 %, registry-valid legs,
 * moderation before promotion, and community voting & comments. All of that is
 * durable here — the previous implementation was browser-local, which meant a
 * second visitor saw nothing and a cleared cache lost the basket.
 *
 * Moderation gate: submissions land as `submitted`; only an admin can move them
 * to `approved`/`rejected`, and promotion into the real catalog happens through
 * the same paused-shell path (no funds move, the published version still needs
 * the dual-approval publish flow).
 */

const MAX_LEGS = 12;
const MAX_NAME = 80;
const MAX_THESIS = 1200;
const MAX_COMMENT = 600;
const PUBLIC_STATUSES = new Set<LabsBasket["status"]>(["submitted", "approved", "promoted"]);

export interface CreateLabsBasketInput {
  name: string;
  thesis?: string;
  category?: string;
  coverImageDataUrl?: string;
  allocations: Array<{ mint: string; weightBps: number }>;
  createdBy: string;
}

function validateCoverImage(dataUrl?: string): string | null {
  if (!dataUrl) return null;
  if (dataUrl.length > 800_000) throw new AppError("INVALID_INPUT", "Cover image is too large after compression");
  const match = /^data:image\/webp;base64,([A-Za-z0-9+/]+={0,2})$/.exec(dataUrl);
  if (!match) throw new AppError("INVALID_INPUT", "Cover image must be a compressed WebP image");
  const bytes = Buffer.from(match[1], "base64");
  if (
    bytes.length > 550 * 1024 ||
    bytes.length < 12 ||
    bytes.toString("ascii", 0, 4) !== "RIFF" ||
    bytes.toString("ascii", 8, 12) !== "WEBP"
  ) {
    throw new AppError("INVALID_INPUT", "Cover image is invalid or too large");
  }
  return dataUrl;
}

function slugify(value: string): string {
  const base = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return base || "labs-basket";
}

async function validateAllocations(
  allocations: Array<{ mint: string; weightBps: number }>
): Promise<Array<{ mint: string; weightBps: number }>> {
  if (!Array.isArray(allocations) || allocations.length === 0) {
    throw new AppError("INVALID_INPUT", "Add at least one leg");
  }
  if (allocations.length > MAX_LEGS) {
    throw new AppError("INVALID_INPUT", `At most ${MAX_LEGS} legs are supported`);
  }
  const seen = new Set<string>();
  for (const allocation of allocations) {
    if (!allocation.mint || typeof allocation.mint !== "string") {
      throw new AppError("INVALID_INPUT", "Every leg needs a mint");
    }
    if (seen.has(allocation.mint)) throw new AppError("INVALID_INPUT", "Duplicate mint in allocation");
    seen.add(allocation.mint);
    if (!Number.isInteger(allocation.weightBps) || allocation.weightBps < 1 || allocation.weightBps > 10_000) {
      throw new AppError("INVALID_INPUT", "Weights must be integer basis points (1–10000)");
    }
    const token = await repository.getToken(allocation.mint);
    if (!token) throw new AppError("MINT_NOT_ALLOWED", `Mint ${allocation.mint} is not in the token registry`);
    if (token.denylisted) throw new AppError("MINT_NOT_ALLOWED", `${token.symbol} is denylisted`);
  }
  const sum = allocations.reduce((total, allocation) => total + allocation.weightBps, 0);
  if (sum !== 10_000) {
    throw new AppError("WEIGHT_SUM_INVALID", `Allocation weights sum to ${sum}, expected 10000`);
  }
  return allocations.map((allocation) => ({ mint: allocation.mint, weightBps: allocation.weightBps }));
}

export async function createLabsBasket(input: CreateLabsBasketInput): Promise<LabsBasket> {
  const name = (input.name || "").trim();
  if (!name) throw new AppError("INVALID_INPUT", "A name is required");
  if (name.length > MAX_NAME) throw new AppError("INVALID_INPUT", `Name must be ≤ ${MAX_NAME} characters`);
  const thesis = (input.thesis || "").trim().slice(0, MAX_THESIS);
  const coverImageDataUrl = validateCoverImage(input.coverImageDataUrl);
  const allocations = await validateAllocations(input.allocations);
  const base = slugify(name);
  let slug = base;
  for (let suffix = 2; await repository.getLabsBasket(slug); suffix += 1) {
    slug = `${base}-${suffix}`;
  }
  const created = await repository.createLabsBasket({
    id: "labs-" + randomUUID().slice(0, 12),
    slug,
    name,
    thesis,
    category: (input.category || "Labs").trim().slice(0, 40) || "Labs",
    coverImageDataUrl,
    allocations,
    createdBy: input.createdBy,
    status: "submitted",
  });
  await repository.logAudit({
    actor: input.createdBy,
    action: "LABS_BASKET_SUBMITTED",
    entity: "labs_basket",
    entityId: created.id,
    after: { slug: created.slug, legs: allocations.length },
  });
  return created;
}

export async function voteForLabsBasket(
  idOrSlug: string,
  walletAddress: string
): Promise<{ labs: LabsBasket; counted: boolean }> {
  const basket = await repository.getLabsBasket(idOrSlug);
  if (!basket || !PUBLIC_STATUSES.has(basket.status)) {
    throw new AppError("LABS_BASKET_NOT_VOTABLE", "This idea is not available for voting.");
  }
  const counted = await repository.addLabsVote(basket.id, walletAddress);
  const updated = await repository.getLabsBasket(basket.id);
  return { labs: updated ?? basket, counted };
}

export async function removeVoteFromLabsBasket(
  idOrSlug: string,
  walletAddress: string
): Promise<{ labs: LabsBasket; removed: boolean }> {
  const basket = await repository.getLabsBasket(idOrSlug);
  if (!basket || !PUBLIC_STATUSES.has(basket.status)) {
    throw new AppError("LABS_BASKET_NOT_VOTABLE", "This idea is not available for voting.");
  }
  const removed = await repository.removeLabsVote(basket.id, walletAddress);
  const updated = await repository.getLabsBasket(basket.id);
  return { labs: updated ?? basket, removed };
}

export async function commentOnLabsBasket(
  idOrSlug: string,
  walletAddress: string,
  body: string
) {
  const basket = await repository.getLabsBasket(idOrSlug);
  if (!basket || !PUBLIC_STATUSES.has(basket.status)) {
    throw new AppError("LABS_BASKET_NOT_FOUND", "Labs basket not found");
  }
  const text = (body || "").trim();
  if (!text) throw new AppError("INVALID_INPUT", "Comment body is required");
  if (text.length > MAX_COMMENT) throw new AppError("INVALID_INPUT", `Comments must be ≤ ${MAX_COMMENT} characters`);
  const comment = await repository.addLabsComment(basket.id, walletAddress, text);
  await repository.logAudit({
    actor: walletAddress,
    action: "LABS_COMMENT_CREATED",
    entity: "labs_comment",
    entityId: comment.id,
    after: { labsBasketId: basket.id },
  });
  return comment;
}

export async function moderateLabsBasket(
  idOrSlug: string,
  decision: "approved" | "rejected",
  note: string,
  actor: string
): Promise<LabsBasket> {
  const basket = await repository.getLabsBasket(idOrSlug);
  if (!basket) throw new AppError("LABS_BASKET_NOT_FOUND", "Labs basket not found");
  const updated = await repository.updateLabsBasketStatus(basket.id, decision, {
    moderationNote: note || null,
  });
  if (!updated) throw new AppError("LABS_BASKET_NOT_FOUND", "Labs basket not found");
  await repository.logAudit({
    actor,
    action: `LABS_BASKET_${decision.toUpperCase()}`,
    entity: "labs_basket",
    entityId: basket.id,
    before: { status: basket.status },
    after: { status: decision, note },
  });
  return updated;
}

/**
 * Promote an approved submission into a real catalog basket.
 *
 * The basket is created `paused` with a v1 version row so it is visible to
 * admins as a draft; it can never be quoted or invested until an admin both
 * activates the basket and publishes through the dual-approval flow. Zero user
 * funds move (X10).
 */
export async function promoteLabsBasket(
  idOrSlug: string,
  actor: string
): Promise<{ labs: LabsBasket; basketId: string }> {
  const labs = await repository.getLabsBasket(idOrSlug);
  if (!labs) throw new AppError("LABS_BASKET_NOT_FOUND", "Labs basket not found");
  if (labs.status !== "approved") {
    throw new AppError("LABS_BASKET_NOT_APPROVED", "Only approved submissions can be promoted");
  }
  if (labs.basketId) return { labs, basketId: labs.basketId };

  let slug = labs.slug;
  for (let suffix = 2; await repository.getBasketBySlug(slug); suffix += 1) {
    slug = `${labs.slug}-${suffix}`;
  }
  const basketId = "basket-" + randomUUID().slice(0, 12);
  const versionId = `ver-${slug}-v1`;
  const version = {
    id: versionId,
    basketId,
    version: 1,
    changelog: `Promoted from Labs by ${actor}`,
    publishedBy: labs.createdBy,
    publishedAt: new Date().toISOString(),
    legs: labs.allocations.map((allocation, index) => ({
      id: `leg-1-${index}`,
      versionId,
      mint: allocation.mint,
      weightBps: allocation.weightBps,
      legType: "spl",
    })),
  };
  await repository.saveBasketVersion(version);
  const basket = await repository.saveBasket({
    id: basketId,
    slug,
    name: labs.name,
    thesis: labs.thesis,
    category: labs.category,
    status: "paused",
    activeVersionId: versionId,
    minUsdc: 25,
    protocols: [],
  });
  const updated = await repository.updateLabsBasketStatus(labs.id, "promoted", { basketId });
  await repository.logAudit({
    actor,
    action: "LABS_BASKET_PROMOTED",
    entity: "labs_basket",
    entityId: labs.id,
    after: { basketId: basket.id, slug: basket.slug, status: "paused" },
  });
  return { labs: updated ?? labs, basketId: basket.id };
}

export const labsService = {
  createLabsBasket,
  voteForLabsBasket,
  removeVoteFromLabsBasket,
  commentOnLabsBasket,
  moderateLabsBasket,
  promoteLabsBasket,
};
