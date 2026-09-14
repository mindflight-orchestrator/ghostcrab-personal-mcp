import { describe, expect, it } from "vitest";
import { verifyMutationReview } from "../../scripts/verify-mutation-review.mjs";

const report = (status = "Survived", duplicate = false) => ({
  files: {
    "src/example.ts": {
      source: "if (safe) save();",
      mutants: Array.from({ length: duplicate ? 2 : 1 }, () => ({
        status,
        mutatorName: "ConditionalExpression",
        replacement: "false",
        location: { start: { line: 1, column: 5 }, end: { line: 1, column: 9 } }
      }))
    }
  }
});
const review = [
  {
    file: "src/example.ts",
    mutator: "ConditionalExpression",
    original: "safe",
    replacement: "false",
    count: 1,
    reason: "Reviewed test fixture"
  }
];

describe("mutation review gate", () => {
  it("rejects a new surviving or uncovered mutation", () => {
    expect(() => verifyMutationReview(report(), [])).toThrow("Unreviewed");
    expect(() => verifyMutationReview(report("NoCoverage"), [])).toThrow(
      "Unreviewed"
    );
  });
  it("accepts a reviewed survivor and its later detection, but not a new duplicate", () => {
    expect(verifyMutationReview(report(), review)).toBe(1);
    expect(verifyMutationReview(report("Killed"), review)).toBe(0);
    expect(() =>
      verifyMutationReview(report("Survived", true), review)
    ).toThrow("Unreviewed");
  });
  it("rejects missing evidence or reviews without a reason", () => {
    expect(() => verifyMutationReview({ files: {} }, review)).toThrow("Empty");
    expect(() =>
      verifyMutationReview(report(), [{ ...review[0], reason: "" }])
    ).toThrow("Invalid");
  });
});
