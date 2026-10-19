import { test, describe } from "node:test";
import assert from "node:assert/strict";

process.env.KAIROS_DB_PATH = ":memory:";

const { repository } = await import("../src/db/repository");
const { run } = await import("../src/db/postgres");

const baseVersion = (id: string, legs = [
  { id: `${id}-jup`, versionId: id, mint: "JUP", weightBps: 5000, legType: "spl" },
  { id: `${id}-gold`, versionId: id, mint: "GOLD", weightBps: 5000, legType: "xstock" },
]) => ({
  id,
  basketId: `bkt-${id}`,
  version: 1,
  changelog: "Initial",
  publishedBy: "tests",
  publishedAt: new Date().toISOString(),
  legs,
});

describe("catalog database integrity", () => {
  test("rejects a published version whose weights do not sum to 10,000 bps", async () => {
    await assert.rejects(
      repository.saveBasketVersion(baseVersion("bv-invalid-sum", [
        { id: "invalid-a", versionId: "bv-invalid-sum", mint: "JUP", weightBps: 4000, legType: "spl" },
        { id: "invalid-b", versionId: "bv-invalid-sum", mint: "GOLD", weightBps: 4000, legType: "xstock" },
      ])),
      /BASKET_VERSION_WEIGHTS_INVALID/
    );
  });

  test("rejects duplicate mints inside one published version", async () => {
    await assert.rejects(
      repository.saveBasketVersion(baseVersion("bv-duplicate-mint", [
        { id: "duplicate-a", versionId: "bv-duplicate-mint", mint: "JUP", weightBps: 5000, legType: "spl" },
        { id: "duplicate-b", versionId: "bv-duplicate-mint", mint: "JUP", weightBps: 5000, legType: "spl" },
      ])),
      /idx_basket_legs_version_mint|duplicate key|UNIQUE/i
    );
  });

  test("replaying a seed version cannot mutate its published composition", async () => {
    const version = baseVersion("bv-append-only");
    await repository.saveBasketVersion(version);
    await repository.saveBasketVersion({
      ...version,
      changelog: "Attempted mutation",
      legs: [{ ...version.legs[0], weightBps: 9000 }, { ...version.legs[1], weightBps: 1000 }],
    });
    const stored = await repository.getBasketVersion(version.id);
    assert.equal(stored?.changelog, "Initial");
    assert.deepEqual(stored?.legs.map((leg) => leg.weightBps), [5000, 5000]);
  });

  test("direct updates to published rows are rejected by the database trigger", async () => {
    const version = baseVersion("bv-trigger");
    await repository.saveBasketVersion(version);
    await assert.rejects(
      run("UPDATE basket_versions SET changelog = ? WHERE id = ?", "bypass", version.id),
      /PUBLISHED_BASKET_VERSION_IMMUTABLE/
    );
  });
});
